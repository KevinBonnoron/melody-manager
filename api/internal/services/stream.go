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

// StreamTrack serves a track's audio: local files with HTTP range support,
// remote URLs proxied (range forwarded), and chaptered/transcoded streams piped
// through ffmpeg.
// diagnostics reports what the transcoder said, when it can say anything.
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

	// Resolve a playable input (local path) or a remote URL to proxy.
	input := localFile(app, track, localRoots(app))
	if input != "" {
		// The track has a file of its own, a downloaded chapter is already cut
		//, so the window must not be applied a second time. Re-cutting asked
		// for 335-508 s inside a 173 s file and produced silence.
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
			// ffmpeg needs a seekable input. Providers that can hand us a local
			// copy do so; the rest are read straight from their remote URL,
			// which is the only way chaptered YouTube tracks play their own
			// segment instead of the whole source video.
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

	// A chapter is extracted once and served as a file, so the player can seek
	// inside it. Piping ffmpeg's output would leave the response unseekable.
	if hasSegment {
		return serveSegment(ctx, e, audio, sourceURL, input, *meta.StartTime, *meta.EndTime)
	}

	// Re-encoding a file that already is in the requested format costs quality
	// and time and buys nothing.
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

// TrackPeaks computes waveform peaks for a track (downloading remote audio if
// needed).
var peaksCache = expirable.NewLRU[string, []float64](500, nil, peaksTTL)

const peaksTTL = 24 * time.Hour

// peaksInflight collapses concurrent requests for the same track onto one
// computation: peaks are a full ffmpeg decode, and the player asks for them
// again on every mount.
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
	// A concurrent caller may have finished while we waited.
	if cached, ok := peaksCache.Get(trackID); ok {
		return cached, nil
	}

	// Finish the decode even if the caller walked away, so the next request
	// for this track is served from memory.
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

	// A chapter must be measured over its own window, not the whole source: a
	// chaptered upload can be hours long, and decoding it through one throttled
	// connection never finished. Reuse the very file playback already extracts.
	if hasSegment && isRemote(input) {
		path, cleanup, err := segmentFile(ctx, audio, sourceURL, input, *meta.StartTime, *meta.EndTime)
		if err != nil {
			return []float64{}, nil
		}
		defer cleanup()
		input = path
	} else if isRemote(input) {
		// Same reason, without a window: pull it in ranges rather than letting
		// ffmpeg trickle the whole thing.
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

// fetchAudio serves the source's audio from the on-disk cache, downloading it
// once on a miss. Without the cache every play of a chaptered track would
// re-download the whole source, which is what the yt-dlp call costs.
func fetchAudio(ctx context.Context, audio *cache.Cache, sourceURL string, download func(context.Context) (string, error)) (string, error) {
	if audio == nil || sourceURL == "" {
		// No cache configured: keep the old behaviour and clean up after.
		path, err := download(ctx)
		if err != nil {
			return "", err
		}
		defer os.Remove(path)
		return path, nil
	}
	return audio.Fetch(ctx, sourceURL, download)
}

// serveSegment cuts [start, end] out of input, keeping the result in the cache
// so a replay costs nothing, and serves it with range support.
// segmentFile returns a local file holding [start, end] of the source, cutting
// and caching it on first use. The returned cleanup is a no-op when the cache
// owns the file.
func segmentFile(ctx context.Context, audio *cache.Cache, sourceURL, input string, start, end float64) (string, func(), error) {
	produce := func(ctx context.Context) (string, error) {
		src := input
		// Letting ffmpeg read the remote source itself means one long-lived
		// connection, which the CDN throttles; pulling it in ranges first is an
		// order of magnitude faster.
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

	// Detached from the request: the browser aborts the previous audio request
	// as soon as the listener skips, and cancelling the extraction there meant
	// nothing was ever cached, every play started from scratch.
	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), extractionTimeout)
	defer cancel()

	if audio == nil {
		path, err := produce(work)
		return path, func() { _ = os.Remove(path) }, err
	}
	path, err := audio.Fetch(work, segmentKey(sourceURL, start, end), produce)
	return path, func() {}, err
}

// segmentKey identifies a cached extract. Playback writes it and the downloader
// drops it, so both must build it the same way.
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

// serveTranscode answers with a complete transcoded file rather than ffmpeg's
// pipe. A piped response carries no length and no byte ranges, and a player
// told to seek in one restarts the track instead: that is what Sonos does, and
// its reported position then disagrees with the interface asking for the seek.
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
		// ffmpeg failing on its first frame leaves an empty file behind, which a
		// player accepts and then sits silent on: a failure with no error
		// anywhere, and the hardest kind to chase.
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			_ = os.Remove(path)
			return "", errors.New("transcode produced no audio")
		}
		return path, nil
	}

	// Detached from the request for the same reason as an extract: a listener
	// who skips aborts the request, and cancelling the encode there would mean
	// nothing is ever cached.
	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), extractionTimeout)
	defer cancel()

	if audio == nil {
		path, err := produce(work)
		return path, func() { _ = os.Remove(path) }, err
	}
	path, err := audio.Fetch(work, transcodeKey(sourceURL, format), produce)
	return path, func() {}, err
}

func transcodeKey(sourceURL, format string) string {
	return fmt.Sprintf("%s#transcode:%s", sourceURL, format)
}

// mimeTypes name what each container is served and announced as. Only
// containers that imply a codec are listed: an .ogg may hold Vorbis or Opus,
// and handing a speaker the one it cannot decode plays silence, so it is left
// out and transcoded instead.
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

// LocalFormat reports the container a track's own file is in, empty when the
// track has no file and has to be fetched from its source.
func LocalFormat(app core.App, track *core.Record) string {
	input := localFile(app, track, localRoots(app))
	if input == "" {
		return ""
	}
	return strings.ToLower(strings.TrimPrefix(filepath.Ext(input), "."))
}

// sameFormat reports whether a local file already is in the requested format.
func sameFormat(input, format string) bool {
	if input == "" || isRemote(input) {
		return false
	}
	return strings.EqualFold(strings.TrimPrefix(filepath.Ext(input), "."), format)
}

// prefixChunk is the range size used to pull a source down. googlevideo
// throttles a single continuous read to a trickle but serves bounded ranges at
// full speed: measured on a 12 MB window, one connection took 82 s and 4 MiB
// ranges took 1.4 s.
const prefixChunk = 4 << 20

// extractionTimeout bounds work that outlives the request that asked for it.
const extractionTimeout = 5 * time.Minute

// downloadPrefix fetches enough of url to cover the first `seconds` of audio,
// in ranged chunks, and returns the path to the temporary file. seconds <= 0
// takes the whole source.
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
		// The container header carries the full duration, so after the first
		// chunk we know how many bytes the wanted window needs.
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

// fetchRange appends one range of url to w, returning the bytes written and the
// resource's total size when the server reports it.
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

// localRoots are the directories a track may legitimately point into: the
// scanned music library, plus wherever each provider was told to download.
// Deduplicated, and not only for tidiness: pointing a provider's downloads at
// the local library is an ordinary setup, and a root listed twice makes a
// rename plan the same folder move twice, where the second attempt finds
// nothing to move and takes the whole rename down with it.
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

// localFile returns the audio this track can be played from on disk, if any.
//
// For a track whose origin is a file, that is the file. For a downloaded one it
// is derived: the downloader lays files out as artist/album/NN - Title.ext, so
// the directory follows from the record and the entry is found by name. Storing
// that path would mean storing a cache's address, and a stale one at that.
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

	// The track number prefix is not always known after the fact and the
	// extension depends on what the downloader got, so the match is on the part
	// that is ours to predict.
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

// withinRoot reports whether p resolves inside the configured music directory.
// Track records carry an operator-supplied absolute path, so without this any
// readable file on the host could be streamed.
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
