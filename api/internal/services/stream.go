package services

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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
func StreamTrack(ctx context.Context, app core.App, reg *providers.Registry, audio *cache.Cache, e *core.RequestEvent, trackID, transcode, userID string) error {
	track, err := app.FindRecordById("tracks", trackID)
	if err != nil {
		return e.NotFoundError("track not found", err)
	}
	var meta domain.TrackMetadata
	_ = track.UnmarshalJSONField("metadata", &meta)
	source := track.GetString("source")
	sourceURL := track.GetString("sourceUrl")
	hasSegment := meta.StartTime != nil && meta.EndTime != nil

	// Resolve a playable input (local path) or a remote URL to proxy.
	input := localInput(meta, sourceURL, localRoot(app))
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

	if transcode != "" || hasSegment {
		var start, end float64
		if hasSegment {
			start, end = *meta.StartTime, *meta.EndTime
		}
		format := transcode
		if format == "" {
			format = "mp3"
		}
		rc, mime, err := ffmpeg.Transcode(ctx, input, start, end, format)
		if err != nil {
			return e.InternalServerError("transcode", err)
		}
		defer rc.Close()
		e.Response.Header().Set("Content-Type", mime)
		e.Response.Header().Set("Accept-Ranges", "none")
		e.Response.WriteHeader(http.StatusOK)
		_, _ = io.Copy(e.Response, rc)
		return nil
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
	http.ServeContent(e.Response, e.Request, filepath.Base(input), info.ModTime(), f)
	return nil
}

// TrackPeaks computes waveform peaks for a track (downloading remote audio if
// needed).
var peaksCache = expirable.NewLRU[string, []float64](500, nil, peaksTTL)

const peaksTTL = 24 * time.Hour

func TrackPeaks(ctx context.Context, app core.App, reg *providers.Registry, audio *cache.Cache, trackID, userID string) ([]float64, error) {
	if cached, ok := peaksCache.Get(trackID); ok {
		return cached, nil
	}
	track, err := app.FindRecordById("tracks", trackID)
	if err != nil {
		return nil, err
	}
	var meta domain.TrackMetadata
	_ = track.UnmarshalJSONField("metadata", &meta)
	input := localInput(meta, track.GetString("sourceUrl"), localRoot(app))
	if input == "" {
		sr := reg.StreamResolver(track.GetString("source"))
		if sr == nil {
			return []float64{}, nil
		}
		st, err := sr.ResolveStream(ctx, track.GetString("sourceUrl"), pbx.EffectiveConfig(app, userID, track.GetString("source")))
		if err != nil {
			return []float64{}, nil
		}
		switch {
		case st.Kind == "file":
			input = st.Path
		case st.Download != nil:
			if input, err = fetchAudio(ctx, audio, track.GetString("sourceUrl"), st.Download); err != nil {
				return []float64{}, nil
			}
		default:
			input = st.URL // ffmpeg can read remote URLs directly
		}
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

func localRoot(app core.App) string {
	return pbx.EffectiveConfig(app, "", "local").String("path")
}

func localInput(meta domain.TrackMetadata, sourceURL, root string) string {
	candidates := make([]string, 0, 2)
	if meta.LocalPath != "" {
		candidates = append(candidates, meta.LocalPath)
	}
	if strings.HasPrefix(sourceURL, "file://") {
		candidates = append(candidates, strings.TrimPrefix(sourceURL, "file://"))
	}
	for _, c := range candidates {
		if p, ok := withinRoot(root, c); ok && fileExists(p) {
			return p
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
