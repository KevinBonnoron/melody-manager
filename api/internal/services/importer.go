// Package services holds the business logic ported from server/src/services.
package services

import (
	"context"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// ImportKind is what the caller asked to import; it selects the bookkeeping
// done once the tracks are persisted.
type ImportKind string

const (
	KindTrack    ImportKind = "tracks"
	KindAlbum    ImportKind = "albums"
	KindArtist   ImportKind = "artists"
	KindPlaylist ImportKind = "playlists"
)

// Import resolves a URL via its provider and persists the resulting tracks
// (creating artists/albums as needed). A playlist import also gets its own
// playlist record, and the user's library is updated so the import is visible.
func Import(ctx context.Context, app core.App, reg *providers.Registry, url string, kind ImportKind, userID string) ([]*core.Record, error) {
	providerID := providers.DetectFromURL(url)
	if providerID == "" {
		return nil, fmt.Errorf("no provider matches URL: %s", url)
	}
	resolver := reg.TrackResolver(providerID)
	if resolver == nil {
		return nil, fmt.Errorf("provider %q cannot resolve tracks", providerID)
	}

	cfg := pbx.EffectiveConfig(app, userID, providerID)
	resolved, err := resolver.ResolveTracks(ctx, url, cfg)
	if err != nil {
		return nil, err
	}

	out := make([]*core.Record, 0, len(resolved))
	for _, rt := range resolved {
		rt.Source = providerID
		rec, err := persistTrack(ctx, app, rt)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}

	if kind == KindPlaylist {
		if err := persistPlaylist(ctx, app, resolver, cfg, url, out, userID); err != nil {
			return nil, err
		}
	}
	if userID != "" {
		autoLikeAlbums(app, userID, out)
	}
	return out, nil
}

// persistPlaylist mirrors the record the old importer created: without it the
// playlist routes, which are driven off playlist_likes, never see the import.
func persistPlaylist(ctx context.Context, app core.App, resolver providers.TrackResolver, cfg providers.Config, url string, tracks []*core.Record, userID string) error {
	if len(tracks) == 0 {
		return nil
	}
	name := url
	if namer, ok := resolver.(providers.PlaylistNamer); ok {
		if title, err := namer.PlaylistName(ctx, url, cfg); err == nil && title != "" {
			name = title
		}
	}
	ids := make([]string, 0, len(tracks))
	for _, t := range tracks {
		ids = append(ids, t.Id)
	}
	playlist, err := getOrCreate(app, "playlists", "sourceUrl = {:u}", dbx.Params{"u": url}, func(r *core.Record) {
		r.Set("name", name)
		r.Set("type", "manual")
		r.Set("sourceUrl", url)
		r.Set("tracks", ids)
	})
	if err != nil {
		return err
	}
	if userID == "" {
		return nil
	}
	_, err = getOrCreate(app, "playlist_likes", "user = {:u} && playlist = {:p}",
		dbx.Params{"u": userID, "p": playlist.Id}, func(r *core.Record) {
			r.Set("user", userID)
			r.Set("playlist", playlist.Id)
		})
	return err
}

// autoLikeAlbums makes an import show up in the user's library, the way the
// old importer's autoLikeFromTracks did.
func autoLikeAlbums(app core.App, userID string, tracks []*core.Record) {
	seen := make(map[string]bool, len(tracks))
	for _, t := range tracks {
		albumID := t.GetString("album")
		if albumID == "" || seen[albumID] {
			continue
		}
		seen[albumID] = true
		if _, err := getOrCreate(app, "album_likes", "user = {:u} && album = {:a}",
			dbx.Params{"u": userID, "a": albumID}, func(r *core.Record) {
				r.Set("user", userID)
				r.Set("album", albumID)
			}); err != nil {
			app.Logger().Warn("auto-like album failed", "album", albumID, "error", err)
		}
	}
}

func persistTrack(ctx context.Context, app core.App, rt domain.ResolvedTrack) (*core.Record, error) {
	artist, err := getOrCreate(app, "artists", "name = {:n}", dbx.Params{"n": rt.ArtistName}, func(r *core.Record) {
		r.Set("name", rt.ArtistName)
	})
	if err != nil {
		return nil, err
	}

	album, err := getOrCreate(app, "albums", "name = {:n} && artists ~ {:a}", dbx.Params{"n": rt.AlbumName, "a": artist.Id}, func(r *core.Record) {
		r.Set("name", rt.AlbumName)
		r.Set("artists", []string{artist.Id})
		if rt.Metadata.Year != nil {
			r.Set("year", *rt.Metadata.Year)
		}
	})
	if err != nil {
		return nil, err
	}
	// The provider resolved a cover; without this the library came out blank.
	if rt.CoverURL != "" && album.GetString("cover") == "" {
		setCoverFromURL(ctx, app, album, rt.CoverURL)
	}

	// Chaptered tracks share a sourceUrl with siblings, so when this is a
	// segment dedupe on (sourceUrl, title) instead of sourceUrl alone.
	filter := "sourceUrl = {:u}"
	params := dbx.Params{"u": rt.SourceURL}
	if rt.Metadata.StartTime != nil {
		filter = "sourceUrl = {:u} && title = {:t}"
		params["t"] = rt.Title
	}

	track, err := getOrCreate(app, "tracks", filter, params, func(r *core.Record) {
		r.Set("title", rt.Title)
		r.Set("duration", rt.Duration)
		r.Set("sourceUrl", rt.SourceURL)
		r.Set("source", rt.Source)
		r.Set("artists", []string{artist.Id})
		r.Set("album", album.Id)
		r.Set("metadata", rt.Metadata)
	})
	if err != nil {
		return nil, err
	}
	return track, nil
}

func getOrCreate(app core.App, collection, filter string, params dbx.Params, set func(*core.Record)) (*core.Record, error) {
	if rec, err := app.FindFirstRecordByFilter(collection, filter, params); err == nil {
		return rec, nil
	}
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	rec := core.NewRecord(col)
	set(rec)
	if err := app.Save(rec); err != nil {
		return nil, err
	}
	return rec, nil
}
