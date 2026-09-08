package services

import (
	"context"
	"sort"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/cache"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

// ResyncAlbum re-extracts chapter boundaries for an album's source video(s) and
// updates each track's startTime/endTime/title. Used for YouTube albums whose
// chapter timings drift or were wrong at import.
func ResyncAlbum(ctx context.Context, app core.App, taskSvc *tasks.Service, audio *cache.Cache, taskID, albumID string) {
	fail := func(err error) {
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Failed; t.Error = err.Error() })
	}
	trackRecs, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": albumID})
	if err != nil {
		fail(err)
		return
	}
	if len(trackRecs) == 0 {
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Completed; t.Progress = 100 })
		return
	}
	taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 10 })

	groups := map[string][]*core.Record{}
	var order []string
	for _, t := range trackRecs {
		u := t.GetString("sourceUrl")
		if _, ok := groups[u]; !ok {
			order = append(order, u)
		}
		groups[u] = append(groups[u], t)
	}

	for _, u := range order {
		grp := groups[u]
		info, err := ytdlp.ExtractTrackInfo(ctx, u, "")
		if err != nil || len(info.Chapters) == 0 {
			continue
		}
		// align tracks to chapters in chronological order
		sort.SliceStable(grp, func(i, j int) bool { return trackStart(grp[i]) < trackStart(grp[j]) })
		n := len(grp)
		if len(info.Chapters) < n {
			n = len(info.Chapters)
		}
		for i := 0; i < n; i++ {
			t, ch := grp[i], info.Chapters[i]
			var meta domain.TrackMetadata
			_ = t.UnmarshalJSONField("metadata", &meta)
			// Moving the window orphans whatever was cached under the old one.
			if audio != nil && meta.StartTime != nil && meta.EndTime != nil {
				audio.Forget(segmentKey(t.GetString("sourceUrl"), *meta.StartTime, *meta.EndTime))
			}
			st, et := ch.StartTime, ch.EndTime
			meta.StartTime = &st
			meta.EndTime = &et
			t.Set("metadata", meta)
			t.Set("title", ch.Title)
			t.Set("duration", int(et-st))
			_ = app.Save(t)
		}
	}
	taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Completed; t.Progress = 100 })
}

func trackStart(t *core.Record) float64 {
	var meta domain.TrackMetadata
	_ = t.UnmarshalJSONField("metadata", &meta)
	if meta.StartTime != nil {
		return *meta.StartTime
	}
	return 0
}
