package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/cache"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ffmpeg"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// StreamTrack serves a track's audio: local files with HTTP range support, remote URLs proxied
// (range forwarded), and chaptered/transcoded streams piped through ffmpeg.
func StreamTrack(ctx context.Context, app core.App, reg *providers.Registry, audio *cache.Cache, e *core.RequestEvent, trackID, transcode, userID string) error {
	track, err := app.FindRecordById("tracks", trackID)
	if err != nil {
		return e.NotFoundError("track not found", err)
	}
	var meta domain.TrackMetadata
	_ = track.UnmarshalJSONField("metadata", &meta)
	source := track.GetString("source")
	sourceURL := track.GetString("origin")
	hasSegment := meta.StartTime != nil && meta.EndTime != nil

	input := localFile(app, track, localRoots(app))
	if input != "" {
		hasSegment = false
	}
	if input == "" {
		sr := reg.StreamResolver(source)
		if sr == nil {
			return e.NotFoundError("no stream resolver for source", nil)
		}
		st, err := sr.ResolveStream(ctx, sourceURL, pbx.EffectiveConfig(app, userID, source))
		if err != nil {
			return e.InternalServerError("resolve stream", err)
		}
		switch {
		case st.Kind == "file":
			input = st.Path
		case hasSegment || transcode != "":
			if st.Download == nil {
				input = st.URL
				break
			}
			if input, err = fetchAudio(ctx, audio, sourceURL, st.Download); err != nil {
				return e.InternalServerError("download", err)
			}
		default:
			return proxyURL(e, st.URL)
		}
	}

	if hasSegment {
		return serveSegment(ctx, e, audio, sourceURL, input, *meta.StartTime, *meta.EndTime)
	}

	if transcode != "" && !sameFormat(input, transcode) {
		return serveTranscode(ctx, e, audio, sourceURL, input, transcode)
	}

	f, err := os.Open(input)
	if err != nil {
		return e.NotFoundError("audio file not found", err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return e.InternalServerError("stat", err)
	}
	if mime := MimeFor(filepath.Ext(input)); mime != "" {
		e.Response.Header().Set("Content-Type", mime)
	}
	http.ServeContent(e.Response, e.Request, filepath.Base(input), info.ModTime(), f)
	return nil
}

var peaksCache = expirable.NewLRU[string, []float64](500, nil, peaksTTL)

const peaksTTL = 24 * time.Hour

var peaksInflight sync.Map

func TrackPeaks(ctx context.Context, app core.App, reg *providers.Registry, audio *cache.Cache, trackID, userID string) ([]float64, error) {
	if cached, ok := peaksCache.Get(trackID); ok {
		return cached, nil
	}

	lock, _ := peaksInflight.LoadOrStore(trackID, &sync.Mutex{})
	mu := lock.(*sync.Mutex)
	mu.Lock()
	defer func() {
		mu.Unlock()
		peaksInflight.Delete(trackID)
	}()
	if cached, ok := peaksCache.Get(trackID); ok {
		return cached, nil
	}

	ctx, cancelPeaks := context.WithTimeout(context.WithoutCancel(ctx), extractionTimeout)
	defer cancelPeaks()
	track, err := app.FindRecordById("tracks", trackID)
	if err != nil {
		return nil, err
	}
	var meta domain.TrackMetadata
	_ = track.UnmarshalJSONField("metadata", &meta)
	sourceURL := track.GetString("origin")
	hasSegment := meta.StartTime != nil && meta.EndTime != nil
	input := localFile(app, track, localRoots(app))
	if input == "" {
		sr := reg.StreamResolver(track.GetString("source"))
		if sr == nil {
			return []float64{}, nil
		}
		st, err := sr.ResolveStream(ctx, sourceURL, pbx.EffectiveConfig(app, userID, track.GetString("source")))
		if err != nil {
			return []float64{}, nil
		}
		switch {
		case st.Kind == "file":
			input = st.Path
		case st.Download != nil:
			if input, err = fetchAudio(ctx, audio, sourceURL, st.Download); err != nil {
				return []float64{}, nil
			}
		default:
			input = st.URL
		}
	}

	if hasSegment && isRemote(input) {
		path, cleanup, err := segmentFile(ctx, audio, sourceURL, input, *meta.StartTime, *meta.EndTime)
		if err != nil {
			return []float64{}, nil
		}
		defer cleanup()
		input = path
	} else if isRemote(input) {
		prefix, err := downloadPrefix(ctx, input, float64(track.GetInt("duration")))
		if err != nil {
			return []float64{}, nil
		}
		defer os.Remove(prefix)
		input = prefix
	}

	peaks, err := ffmpeg.Peaks(ctx, input, 800)
	if err != nil {
		return nil, err
	}
	peaksCache.Add(trackID, peaks)
	return peaks, nil
}

func fetchAudio(ctx context.Context, audio *cache.Cache, sourceURL string, download func(context.Context) (string, error)) (string, error) {
	if audio == nil || sourceURL == "" {
		path, err := download(ctx)
		if err != nil {
			return "", err
		}
		defer os.Remove(path)
		return path, nil
	}
	return audio.Fetch(ctx, sourceURL, download)
}

func segmentFile(ctx context.Context, audio *cache.Cache, sourceURL, input string, start, end float64) (string, func(), error) {
	produce := func(ctx context.Context) (string, error) {
		src := input
		if isRemote(input) {
			prefix, err := downloadPrefix(ctx, input, end)
			if err != nil {
				return "", err
			}
			defer os.Remove(prefix)
			src = prefix
		}
		tmp, err := os.CreateTemp("", "segment-*.mp3")
		if err != nil {
			return "", err
		}
		path := tmp.Name()
		_ = tmp.Close()
		if err := ffmpeg.SaveSegment(ctx, src, start, end, path); err != nil {
			_ = os.Remove(path)
			return "", err
		}
		return path, nil
	}

	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), extractionTimeout)
	defer cancel()

	if audio == nil {
		path, err := produce(work)
		return path, func() { _ = os.Remove(path) }, err
	}
	path, err := audio.Fetch(work, segmentKey(sourceURL, start, end), produce)
	return path, func() {}, err
}

func segmentKey(sourceURL string, start, end float64) string {
	return fmt.Sprintf("%s#segment:%g-%g", sourceURL, start, end)
}

func isRemote(input string) bool {
	return strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://")
}

func serveSegment(ctx context.Context, e *core.RequestEvent, audio *cache.Cache, sourceURL, input string, start, end float64) error {
	path, cleanup, err := segmentFile(ctx, audio, sourceURL, input, start, end)
	if err != nil {
		return e.InternalServerError("segment", err)
	}
	defer cleanup()

	f, err := os.Open(path)
	if err != nil {
		return e.InternalServerError("segment", err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return e.InternalServerError("segment", err)
	}
	e.Response.Header().Set("Content-Type", "audio/mpeg")
	http.ServeContent(e.Response, e.Request, filepath.Base(path), info.ModTime(), f)
	return nil
}

func serveTranscode(ctx context.Context, e *core.RequestEvent, audio *cache.Cache, sourceURL, input, format string) error {
	path, cleanup, err := transcodeFile(ctx, audio, sourceURL, input, format)
	if err != nil {
		return e.InternalServerError("transcode", err)
	}
	defer cleanup()

	f, err := os.Open(path)
	if err != nil {
		return e.InternalServerError("transcode", err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return e.InternalServerError("transcode", err)
	}
	if spec, ok := ffmpeg.FormatFor(format); ok {
		e.Response.Header().Set("Content-Type", spec.MimeType)
	}
	http.ServeContent(e.Response, e.Request, filepath.Base(path), info.ModTime(), f)
	return nil
}

func transcodeFile(ctx context.Context, audio *cache.Cache, sourceURL, input, format string) (string, func(), error) {
	produce := func(ctx context.Context) (string, error) {
		src := input
		if isRemote(input) {
			full, err := downloadPrefix(ctx, input, 0)
			if err != nil {
				return "", err
			}
			defer os.Remove(full)
			src = full
		}
		tmp, err := os.CreateTemp("", "transcode-*"+ffmpeg.Extension(format))
		if err != nil {
			return "", err
		}
		path := tmp.Name()
		_ = tmp.Close()
		if err := ffmpeg.SaveTranscode(ctx, src, format, path); err != nil {
			_ = os.Remove(path)
			return "", err
		}
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			_ = os.Remove(path)
			return "", errors.New("transcode produced no audio")
		}
		return path, nil
	}

	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), extractionTimeout)
	defer cancel()

	if audio == nil {
		path, err := produce(work)
		return path, func() { _ = os.Remove(path) }, err
	}
	path, err := audio.Fetch(work, transcodeKey(sourceURL, format), produce)
	return path, func() {}, err
}

const transcodeRecipe = 2

func transcodeKey(sourceURL, format string) string {
	return fmt.Sprintf("%s#transcode%d:%s", sourceURL, transcodeRecipe, format)
}

var mimeTypes = map[string]string{
	"mp3":  "audio/mpeg",
	"flac": "audio/flac",
	"wav":  "audio/wav",
	"m4a":  "audio/mp4",
	"aiff": "audio/aiff",
	"aif":  "audio/aiff",
}

// MimeFor returns the MIME type a format is served as, empty when unknown.
func MimeFor(format string) string {
	return mimeTypes[strings.ToLower(strings.TrimPrefix(format, "."))]
}

// LocalFormat reports the container a track's own file is in, empty when the track has no file
// and has to be fetched from its source.
func LocalFormat(app core.App, track *core.Record) string {
	input := localFile(app, track, localRoots(app))
	if input == "" {
		return ""
	}
	return strings.ToLower(strings.TrimPrefix(filepath.Ext(input), "."))
}

// LocalAudio reads what a track's own file actually holds.
func LocalAudio(ctx context.Context, app core.App, track *core.Record) (ffmpeg.Audio, error) {
	input := localFile(app, track, localRoots(app))
	if input == "" {
		return ffmpeg.Audio{}, errors.New("track has no local file")
	}
	return ffmpeg.ProbeAudio(ctx, input)
}

func sameFormat(input, format string) bool {
	if input == "" || isRemote(input) {
		return false
	}
	return strings.EqualFold(strings.TrimPrefix(filepath.Ext(input), "."), format)
}

const prefixChunk = 4 << 20

const extractionTimeout = 5 * time.Minute

func downloadPrefix(ctx context.Context, url string, seconds float64) (string, error) {
	f, err := os.CreateTemp("", "source-*.bin")
	if err != nil {
		return "", err
	}
	path := f.Name()
	defer f.Close()

	var total, need int64
	for offset := int64(0); ; offset += prefixChunk {
		if need > 0 && offset >= need {
			break
		}
		n, size, err := fetchRange(ctx, url, offset, prefixChunk, f)
		if err != nil {
			_ = os.Remove(path)
			return "", err
		}
		if size > 0 {
			total = size
		}
		if n == 0 || (total > 0 && offset+n >= total) {
			break
		}
		if need == 0 && total > 0 {
			if seconds <= 0 {
				need = total
				continue
			}
			duration, err := ffmpeg.ProbeDuration(ctx, path)
			if err != nil || duration <= 0 {
				need = total // cannot tell; take everything
				continue
			}
			need = int64(float64(total)*(seconds/duration)*1.1) + prefixChunk
			if need > total {
				need = total
			}
		}
	}
	return path, nil
}

func fetchRange(ctx context.Context, url string, offset, length int64, w io.Writer) (int64, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", offset, offset+length-1))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("range request: unexpected status %d", resp.StatusCode)
	}
	n, err := io.Copy(w, resp.Body)
	if err != nil {
		return n, 0, err
	}
	var total int64
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		if i := strings.LastIndex(cr, "/"); i >= 0 {
			total, _ = strconv.ParseInt(cr[i+1:], 10, 64)
		}
	}
	return n, total, nil
}

func localRoots(app core.App) []string {
	var roots []string
	seen := map[string]bool{}
	add := func(path string) {
		if path == "" {
			return
		}
		clean := filepath.Clean(path)
		if seen[clean] {
			return
		}
		seen[clean] = true
		roots = append(roots, clean)
	}

	add(pbx.EffectiveConfig(app, "", "local").String("path"))
	for _, mf := range providers.Manifests() {
		add(pbx.EffectiveConfig(app, "", mf.ID).String("downloadPath"))
	}
	return roots
}

func localFile(app core.App, track *core.Record, roots []string) string {
	if origin := track.GetString("origin"); strings.HasPrefix(origin, "file://") {
		path := strings.TrimPrefix(origin, "file://")
		for _, root := range roots {
			if p, ok := withinRoot(root, path); ok && fileExists(p) {
				return p
			}
		}
		return ""
	}

	album, err := app.FindRecordById("albums", track.GetString("album"))
	if err != nil {
		return ""
	}

	suffix := " - " + sanitizeFilename(track.GetString("title"))
	for _, root := range roots {
		if root == "" {
			continue
		}

		dir := filepath.Join(root, sanitizeFilename(artistName(app, track, album)), sanitizeFilename(album.GetString("name")))
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			name := entry.Name()
			if !strings.HasSuffix(strings.TrimSuffix(name, filepath.Ext(name)), suffix) {
				continue
			}
			if p, ok := withinRoot(root, filepath.Join(dir, name)); ok {
				return p
			}
		}
	}

	return ""
}

func withinRoot(root, p string) (string, bool) {
	if root == "" || p == "" {
		return "", false
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	if resolved, err := filepath.EvalSymlinks(absRoot); err == nil {
		absRoot = resolved
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", false
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	rel, err := filepath.Rel(absRoot, abs)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return abs, true
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func proxyURL(e *core.RequestEvent, url string) error {
	if url == "" {
		return e.NotFoundError("no stream url", nil)
	}
	req, err := http.NewRequestWithContext(e.Request.Context(), http.MethodGet, url, nil)
	if err != nil {
		return e.InternalServerError("proxy request", err)
	}
	if rng := e.Request.Header.Get("Range"); rng != "" {
		req.Header.Set("Range", rng)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return e.InternalServerError("proxy fetch", err)
	}
	defer resp.Body.Close()
	for _, h := range []string{"Content-Type", "Content-Length", "Accept-Ranges", "Content-Range"} {
		if v := resp.Header.Get(h); v != "" {
			e.Response.Header().Set(h, v)
		}
	}
	e.Response.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(e.Response, resp.Body)
	return nil
}
