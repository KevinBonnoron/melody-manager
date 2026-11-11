package services

import (
	"context"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// legacyAlbumSuffix ends the name an album got when a YouTube video with neither chapters nor
// an album of its own was imported: every such video of a channel landed in "<channel> - youtube".
const legacyAlbumSuffix = " - youtube"

// coverFetchTimeout bounds one thumbnail download made while migrating, and coverFetchFailures
// is how many in a row end the attempt: a server with no route out would otherwise hold the
// start for every album.
const (
	coverFetchTimeout  = 5 * time.Second
	coverFetchFailures = 3
)

// SplitLegacyYouTubeAlbums gives each track of the "<channel> - youtube" albums an album of its
// own, named after the track, as an import does now. Downloaded files follow their track, likes
// follow the album, and what cannot be moved stays where it is. It is safe to run again.
func SplitLegacyYouTubeAlbums(ctx context.Context, app core.App) error {
	albums, err := app.FindRecordsByFilter("albums", "name ~ {:s}", "", 0, 0, dbx.Params{"s": "%" + legacyAlbumSuffix})
	if err != nil {
		return err
	}

	failures := 0
	for _, old := range albums {
		if !strings.HasSuffix(old.GetString("name"), legacyAlbumSuffix) {
			continue
		}
		tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": old.Id})
		if err != nil {
			return err
		}
		if len(tracks) == 0 || !isLegacyYouTubeAlbum(tracks) {
			continue
		}

		for _, track := range tracks {
			var meta domain.TrackMetadata
			_ = track.UnmarshalJSONField("metadata", &meta)

			credit := track.GetStringSlice("artists")
			if len(credit) == 0 {
				credit = old.GetStringSlice("artists")
			}
			if len(credit) == 0 {
				continue
			}
			title := track.GetString("title")
			next, err := getOrCreate(app, "albums", "name = {:n} && artists ~ {:a}", dbx.Params{"n": title, "a": credit[0]}, func(r *core.Record) {
				r.Set("name", title)
				r.Set("artists", credit)
				if meta.Year != nil {
					r.Set("year", *meta.Year)
				}
			})
			if err != nil {
				app.Logger().Warn("split legacy album: creating album failed", "track", track.Id, "error", err)
				continue
			}
			if err := carryAlbumRatings(app, old.Id, next.Id); err != nil {
				app.Logger().Warn("split legacy album: carrying likes failed", "track", track.Id, "error", err)
			}
			if err := MoveTracks(app, []string{track.Id}, next.Id); err != nil {
				app.Logger().Warn("split legacy album: moving track failed", "track", track.Id, "error", err)
				deleteIfUnused(app, "albums", next.Id, "album = {:id}")
				continue
			}

			if next.GetString("cover") == "" && meta.CoverArtURL != "" && failures < coverFetchFailures {
				fetch, cancel := context.WithTimeout(ctx, coverFetchTimeout)
				setCoverFromURL(fetch, app, next, meta.CoverArtURL)
				cancel()
				if fresh, err := app.FindRecordById("albums", next.Id); err == nil && fresh.GetString("cover") != "" {
					failures = 0
				} else {
					failures++
				}
			}
		}
	}
	return nil
}

func isLegacyYouTubeAlbum(tracks []*core.Record) bool {
	for _, track := range tracks {
		if track.GetString("source") != "youtube" {
			return false
		}
		var meta domain.TrackMetadata
		_ = track.UnmarshalJSONField("metadata", &meta)
		if meta.StartTime != nil {
			return false
		}
	}
	return true
}

// BackfillAlbumTypes names the kind of release of albums made before the kind was kept. Only
// albums whose whole content is known are touched: local albums, which carry their own track
// counts, and videos cut on their chapters. The rest, such as one track of an album a catalog
// listed, are left without a kind rather than called singles.
func BackfillAlbumTypes(app core.App) error {
	albums, err := app.FindRecordsByFilter("albums", "type = '' && typeLocked = false", "", 0, 0)
	if err != nil {
		return err
	}
	for _, album := range albums {
		tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": album.Id})
		if err != nil {
			return err
		}
		if len(tracks) == 0 || !isWholeAlbum(tracks) {
			continue
		}
		if err := RefreshAlbumType(app, album.Id); err != nil {
			return err
		}
	}
	return nil
}

func isWholeAlbum(tracks []*core.Record) bool {
	for _, track := range tracks {
		var meta domain.TrackMetadata
		_ = track.UnmarshalJSONField("metadata", &meta)
		if track.GetString("source") != localSource && meta.StartTime == nil {
			return false
		}
	}
	return true
}
