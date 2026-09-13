// Package services holds the business logic ported from server/src/services.
package services

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

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
	cfg := pbx.EffectiveConfig(app, userID, providerID)

	resolver := reg.TrackResolver(providerID)
	if resolver == nil {
		// A catalog-only source knows the track but cannot serve its audio.
		// Pair its metadata with a playable source rather than storing a track
		// nothing can play.
		catalog := reg.CatalogResolver(providerID)
		if catalog == nil {
			return nil, fmt.Errorf("provider %q cannot resolve tracks", providerID)
		}

		meta, err := catalog.ResolveCatalogTrack(ctx, url, cfg)
		if err != nil {
			return nil, err
		}

		playable, err := resolvePlayable(ctx, app, reg, meta, userID)
		if err != nil {
			return nil, err
		}

		rec, err := persistTrack(ctx, app, playable)
		if err != nil {
			return nil, err
		}
		if userID != "" {
			autoLikeAlbums(app, userID, []*core.Record{rec})
		}
		return []*core.Record{rec}, nil
	}

	resolved, err := resolver.ResolveTracks(ctx, url, cfg)
	if err != nil {
		return nil, err
	}

	// persistTrack writes an artist, then an album, then the track. Without a
	// transaction a failure on the last step left the first two behind: an album
	// with no track belongs to no source (source lives on tracks), so it showed
	// up on the home screen and nowhere else.
	out := make([]*core.Record, 0, len(resolved))
	if err := app.RunInTransaction(func(txApp core.App) error {
		out = out[:0]
		for _, rt := range resolved {
			rt.Source = providerID
			rec, err := persistTrack(ctx, txApp, rt)
			if err != nil {
				return err
			}
			out = append(out, rec)
		}
		return nil
	}); err != nil {
		return nil, err
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
// playlist routes, which are driven off playlist_ratings, never see the import.
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
	playlist, err := getOrCreate(app, "playlists", "origin = {:u}", dbx.Params{"u": url}, func(r *core.Record) {
		r.Set("name", name)
		r.Set("type", "manual")
		r.Set("origin", url)
		r.Set("tracks", ids)
	})
	if err != nil {
		return err
	}
	if userID == "" {
		return nil
	}
	_, err = getOrCreate(app, "playlist_ratings", "user = {:u} && playlist = {:p}",
		dbx.Params{"u": userID, "p": playlist.Id}, func(r *core.Record) {
			r.Set("user", userID)
			r.Set("playlist", playlist.Id)
			r.Set("value", "like")
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
		if _, err := getOrCreate(app, "album_ratings", "user = {:u} && album = {:a}",
			dbx.Params{"u": userID, "a": albumID}, func(r *core.Record) {
				r.Set("user", userID)
				r.Set("album", albumID)
				r.Set("value", "like")
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

	// Artists were created with a name and nothing else, so every imported one
	// showed a placeholder. Only fill an empty image: a better one may have been
	// set elsewhere, or by hand.
	if rt.ArtistImageURL != "" && artist.GetString("cover") == "" {
		setCoverFromURL(ctx, app, artist, rt.ArtistImageURL)
	}

	// Chaptered tracks share a origin with siblings, so when this is a
	// segment dedupe on (origin, title) instead of origin alone.
	filter := "origin = {:u}"
	params := dbx.Params{"u": rt.Origin}
	if rt.Metadata.StartTime != nil {
		filter = "origin = {:u} && title = {:t}"
		params["t"] = rt.Title
	}

	track, err := getOrCreate(app, "tracks", filter, params, func(r *core.Record) {
		r.Set("title", rt.Title)
		r.Set("duration", rt.Duration)
		r.Set("origin", rt.Origin)
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

func setCoverFromURL(ctx context.Context, app core.App, rec *core.Record, u string) {
	f, err := filesystem.NewFileFromURL(ctx, u)
	if err != nil {
		return
	}
	rec.Set("cover", f)
	_ = app.Save(rec)
}

// playbackProvider is the source a catalog-only track falls back to for audio.
const playbackProvider = "youtube"

// resolvePlayable finds the catalog track on a source that can actually stream
// it, and keeps the catalogue's metadata: the title, artist and cover come from
// Spotify, the audio from YouTube. `source` follows the audio, because that is
// what picks the stream resolver everywhere else.
func resolvePlayable(ctx context.Context, app core.App, reg *providers.Registry, meta domain.ResolvedTrack, userID string) (domain.ResolvedTrack, error) {
	searcher := reg.Searcher(playbackProvider)
	resolver := reg.TrackResolver(playbackProvider)
	if searcher == nil || resolver == nil {
		return domain.ResolvedTrack{}, fmt.Errorf("no playable source for %q", meta.Source)
	}

	cfg := pbx.EffectiveConfig(app, userID, playbackProvider)
	query := strings.TrimSpace(meta.ArtistName + " " + meta.Title)
	hits, err := searcher.Search(ctx, query, domain.ResultTrack, cfg)
	if err != nil {
		return domain.ResolvedTrack{}, err
	}
	if len(hits) == 0 {
		return domain.ResolvedTrack{}, fmt.Errorf("no playable match for %q", query)
	}

	resolved, err := resolver.ResolveTracks(ctx, hits[0].Origin, cfg)
	if err != nil {
		return domain.ResolvedTrack{}, err
	}
	if len(resolved) == 0 {
		return domain.ResolvedTrack{}, fmt.Errorf("no playable match for %q", query)
	}

	out := resolved[0]
	out.Title = meta.Title
	out.ArtistName = meta.ArtistName
	out.AlbumName = meta.AlbumName
	if meta.CoverURL != "" {
		out.CoverURL = meta.CoverURL
	}
	out.Metadata.SpotifyID = meta.Metadata.SpotifyID
	out.Source = playbackProvider
	return out, nil
}
