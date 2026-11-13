package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// legacyAlbumSuffix ends the name an album got when a YouTube video with neither chapters nor
// an album of its own was imported: every such video of a channel landed in "<channel> - youtube".
const legacyAlbumSuffix = " - youtube"

// Cover requests share one startup deadline; successful downloads cannot reset it.
const (
	coverFetchTimeout  = 5 * time.Second
	coverFetchBudget   = 5 * time.Second
	coverFetchFailures = 3
)

// CompleteAlbumTypeMigration runs after schema migrations commit because splitting can move files.
// The marker is cleared only after all work succeeds, making interrupted starts retryable.
func CompleteAlbumTypeMigration(ctx context.Context, app core.App) error {
	var pending int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM _album_type_backfill").Row(&pending); err != nil {
		return err
	}
	if pending == 0 {
		return nil
	}
	if err := SplitLegacyYouTubeAlbums(ctx, app); err != nil {
		return err
	}
	if err := BackfillAlbumTypes(app); err != nil {
		return err
	}
	_, err := app.DB().NewQuery("DELETE FROM _album_type_backfill").Execute()
	return err
}

// SplitLegacyYouTubeAlbums gives each track of the "<channel> - youtube" albums an album of its
// own, named after the track, as an import does now. Downloaded files follow their track, likes
// follow the album, and what cannot be moved stays where it is. It is safe to run again.
func SplitLegacyYouTubeAlbums(ctx context.Context, app core.App) error {
	return splitLegacyYouTubeAlbums(ctx, app, coverFetchBudget)
}

func splitLegacyYouTubeAlbums(ctx context.Context, app core.App, coverBudget time.Duration) error {
	coverCtx, cancelCovers := context.WithTimeout(ctx, coverBudget)
	defer cancelCovers()
	albums, err := app.FindRecordsByFilter("albums", "name ~ {:s}", "", 0, 0, dbx.Params{"s": "%" + legacyAlbumSuffix})
	if err != nil {
		return err
	}

	failures := 0
	roots := localRoots(app)
albumLoop:
	for _, old := range albums {
		if old.GetString("videoOrigin") != "" || !strings.HasSuffix(old.GetString("name"), legacyAlbumSuffix) {
			continue
		}
		tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": old.Id})
		if err != nil {
			return err
		}
		if len(tracks) == 0 || !isLegacyYouTubeAlbum(tracks) {
			continue
		}
		// Inspect the entire legacy album before moving anything. Ambiguous
		// ownership needs a person to resolve it, not a failed server start.
		for _, track := range tracks {
			if _, err := downloadedFileForMove(app, track, roots); errors.Is(err, errAmbiguousDownloadedFile) {
				app.Logger().Warn("leaving ambiguous legacy album unsplit", "album", old.Id, "error", err)
				continue albumLoop
			} else if err != nil {
				return fmt.Errorf("split legacy album: checking track %s: %w", track.Id, err)
			}
		}

		for _, track := range tracks {
			var meta domain.TrackMetadata
			_ = track.UnmarshalJSONField("metadata", &meta)

			credit := track.GetStringSlice("artists")
			if len(credit) == 0 {
				credit = old.GetStringSlice("artists")
			}
			if len(credit) == 0 {
				return fmt.Errorf("split legacy album: track %s has no artist", track.Id)
			}
			title := track.GetString("title")
			col, err := app.FindCollectionByNameOrId("albums")
			if err != nil {
				return err
			}
			next := core.NewRecord(col)
			next.Set("name", title)
			next.Set("artists", credit)
			next.Set("videoOrigin", track.GetString("origin"))
			if meta.Year != nil {
				next.Set("year", *meta.Year)
			}
			err = app.Save(next)
			if err != nil {
				return fmt.Errorf("split legacy album: creating album for track %s: %w", track.Id, err)
			}
			if err := moveTracks(app, []string{track.Id}, next.Id, old.Id); err != nil {
				deleteIfUnused(app, "albums", next.Id, "album = {:id}")
				return fmt.Errorf("split legacy album: moving track %s: %w", track.Id, err)
			}
			next, err = app.FindRecordById("albums", next.Id)
			if err != nil {
				return err
			}

			if next.GetString("cover") == "" && meta.CoverArtURL != "" && failures < coverFetchFailures && coverCtx.Err() == nil {
				fetch, cancel := context.WithTimeout(coverCtx, coverFetchTimeout)
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
	albums, err := app.FindRecordsByFilter("albums", "", "", 0, 0)
	if err != nil {
		return err
	}
	for _, album := range albums {
		tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": album.Id})
		if err != nil {
			return err
		}
		if album.GetString("videoOrigin") != "" {
			continue
		}
		if len(tracks) == 0 {
			continue
		}
		if !isWholeAlbum(album, tracks) {
			album.Set("typeIncomplete", true)
			if err := app.Save(album); err != nil {
				return err
			}
		} else if !album.GetBool("typeLocked") && album.GetString("type") == "" {
			if err := RefreshAlbumType(app, album.Id); err != nil {
				return err
			}
		}
	}
	return nil
}

func isWholeAlbum(album *core.Record, tracks []*core.Record) bool {
	for _, track := range tracks {
		var meta domain.TrackMetadata
		_ = track.UnmarshalJSONField("metadata", &meta)
		if track.GetString("source") != localSource && (meta.StartTime == nil || !strings.HasSuffix(album.GetString("name"), legacyAlbumSuffix)) {
			return false
		}
	}
	return true
}
