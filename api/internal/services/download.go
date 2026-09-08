package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/cache"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ffmpeg"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

var unsafeFilenameChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// sanitizeFilename mirrors the naming the old server used, so a library
// downloaded before the migration keeps the same shape.
func sanitizeFilename(name string) string {
	name = unsafeFilenameChars.ReplaceAllString(name, "_")
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "Unknown"
	}
	return name
}

// artistName prefers the track's own artist and falls back to the album's.
func artistName(app core.App, track, album *core.Record) string {
	for _, ids := range [][]string{track.GetStringSlice("artists"), album.GetStringSlice("artists")} {
		if len(ids) == 0 {
			continue
		}
		if a, err := app.FindRecordById("artists", ids[0]); err == nil {
			if n := a.GetString("name"); n != "" {
				return n
			}
		}
	}
	return "Unknown Artist"
}

// DownloadAlbum downloads an album's tracks to the provider's configured
// downloadPath and points each track at the local file. Tracks sharing a source
// URL (chaptered YouTube albums) are downloaded once then segmented per chapter.
// Runs in the background and reports progress via the task service.
func DownloadAlbum(ctx context.Context, app core.App, taskSvc *tasks.Service, audio *cache.Cache, taskID, albumID string) {
	fail := func(err error) {
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Failed; t.Error = err.Error() })
	}

	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		fail(err)
		return
	}
	trackRecs, err2 := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": albumID})
	if err2 != nil {
		fail(err2)
		return
	}
	if len(trackRecs) == 0 {
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Completed; t.Progress = 100 })
		return
	}

	groups := map[string][]*core.Record{}
	var order []string
	for _, t := range trackRecs {
		u := t.GetString("sourceUrl")
		if _, ok := groups[u]; !ok {
			order = append(order, u)
		}
		groups[u] = append(groups[u], t)
	}

	total := len(trackRecs)
	done := 0
	var firstErr error
	taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 5 })

	for _, u := range order {
		grp := groups[u]
		src := grp[0].GetString("source")
		dir := pbx.EffectiveConfig(app, "", src).String("downloadPath")
		if dir == "" {
			fail(fmt.Errorf("no download path set for %s — set it in Admin › Providers › %s", src, src))
			return
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fail(err)
			return
		}

		tmp, err := ytdlp.DownloadAudio(ctx, u)
		if err != nil {
			fail(err)
			return
		}

		// artist/album/NN - Title.ext, the layout any music player expects —
		// flat files named after a record id are unusable outside the app.
		albumDir := filepath.Join(dir, sanitizeFilename(artistName(app, grp[0], album)), sanitizeFilename(album.GetString("name")))
		if err := os.MkdirAll(albumDir, 0o755); err != nil {
			fail(err)
			return
		}
		ext := filepath.Ext(tmp)
		if ext == "" {
			ext = ".m4a"
		}

		for i, t := range grp {
			var meta domain.TrackMetadata
			_ = t.UnmarshalJSONField("metadata", &meta)
			start, end := 0.0, 0.0
			if meta.StartTime != nil {
				start = *meta.StartTime
			}
			if meta.EndTime != nil {
				end = *meta.EndTime
			}
			number := i + 1
			if meta.TrackNumber != nil && *meta.TrackNumber > 0 {
				number = *meta.TrackNumber
			}
			out := filepath.Join(albumDir, fmt.Sprintf("%02d - %s%s", number, sanitizeFilename(t.GetString("title")), ext))
			// Copy rather than re-encode: the point of downloading is to keep
			// the source quality, and it is much faster.
			if err := ffmpeg.SaveSegmentCopy(ctx, tmp, start, end, out); err != nil {
				// Remember why, so a run where every track fails does not end up
				// reported as a success with nothing to show for it.
				app.Logger().Warn("album download: segment failed", "track", t.Id, "error", err)
				if firstErr == nil {
					firstErr = fmt.Errorf("%s: %w", t.GetString("title"), err)
				}
				continue
			}
			meta.LocalPath = out
			t.Set("metadata", meta)
			_ = app.Save(t)
			// The track plays from disk now, so the extract cached for it is
			// dead weight.
			if audio != nil {
				audio.Forget(segmentKey(u, start, end))
			}
			done++
			progress := 5 + done*90/total
			taskSvc.Update(taskID, func(tk *tasks.Task) { tk.Progress = progress })
		}
		_ = os.Remove(tmp)
	}

	if done == 0 && firstErr != nil {
		fail(firstErr)
		return
	}
	taskSvc.Update(taskID, func(t *tasks.Task) {
		t.Status = tasks.Completed
		t.Progress = 100
		if firstErr != nil {
			// Partial success is still a success, but say what was skipped.
			t.Error = fmt.Sprintf("%d of %d tracks failed, first: %v", total-done, total, firstErr)
		}
	})
}
