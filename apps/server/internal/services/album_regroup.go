package services

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// RefreshAlbumType gives an album the kind of release its tracks make up, unless a person
// chose that kind (typeLocked). A local album's tags say how many tracks it should hold, which
// outweighs how many of them are in the library.
func RefreshAlbumType(app core.App, albumID string) error {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	if album.GetBool("typeLocked") {
		return nil
	}

	tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": albumID})
	if err != nil {
		return err
	}

	count, seconds, declared := len(tracks), 0, 0
	for _, track := range tracks {
		seconds += track.GetInt("duration")
		var meta domain.TrackMetadata
		_ = track.UnmarshalJSONField("metadata", &meta)
		if meta.TotalTracks != nil && *meta.TotalTracks > declared {
			declared = *meta.TotalTracks
		}
	}
	if declared > count {
		count = declared
	}

	kind := domain.ClassifyAlbum(count, seconds)
	if album.GetString("type") == kind {
		return nil
	}
	album.Set("type", kind)
	return app.Save(album)
}

// SetAlbumType records the kind of release a person says an album is, and stops it being
// worked out again. An empty kind hands the decision back.
func SetAlbumType(app core.App, albumID, kind string) error {
	switch kind {
	case domain.AlbumSingle, domain.AlbumEP, domain.AlbumFull, domain.AlbumMix, "":
	default:
		return fmt.Errorf("unknown album type %q", kind)
	}

	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	if kind == "" {
		album.Set("typeLocked", false)
		if err := app.Save(album); err != nil {
			return err
		}
		return RefreshAlbumType(app, albumID)
	}

	album.Set("type", kind)
	album.Set("typeLocked", true)
	return app.Save(album)
}

// MoveTracks puts tracks in another album. A track downloaded to this server's disk has its
// file moved to the new album's folder, since that is where it is looked for.
func MoveTracks(app core.App, trackIDs []string, albumID string) error {
	target, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}

	roots := localRoots(app)
	var moves []move
	var tracks []*core.Record
	sources := map[string]bool{}
	for _, id := range trackIDs {
		track, err := app.FindRecordById("tracks", id)
		if err != nil {
			return err
		}
		from := track.GetString("album")
		if from == target.Id {
			continue
		}
		sources[from] = true
		tracks = append(tracks, track)

		if strings.HasPrefix(track.GetString("origin"), "file://") {
			continue
		}
		src := localFile(app, track, roots)
		if src == "" {
			continue
		}
		dst := filepath.Join(rootOf(app, src), sanitizeFilename(artistName(app, track, target)), sanitizeFilename(target.GetString("name")), filepath.Base(src))
		if src != dst {
			moves = append(moves, move{from: src, to: dst})
		}
	}
	if len(tracks) == 0 {
		return nil
	}

	if err := checkDestinations(moves); err != nil {
		return err
	}
	if err := applyMoves(moves); err != nil {
		return err
	}

	if err := app.RunInTransaction(func(tx core.App) error {
		for _, track := range tracks {
			track.Set("album", target.Id)
			if err := tx.Save(track); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		undoMoves(moves)
		return err
	}

	for _, m := range moves {
		pruneEmpty(filepath.Dir(m.from), rootOf(app, m.from))
	}
	for id := range sources {
		deleteIfUnused(app, "albums", id, "album = {:id}")
		if _, err := app.FindRecordById("albums", id); err == nil {
			if err := RefreshAlbumType(app, id); err != nil {
				return err
			}
		}
	}
	return RefreshAlbumType(app, target.Id)
}

// MergeAlbums moves every track of an album into another and removes the emptied album,
// keeping the likes it had where the other has none.
func MergeAlbums(app core.App, fromID, intoID string) error {
	if fromID == intoID {
		return errors.New("an album cannot be merged into itself")
	}
	if _, err := app.FindRecordById("albums", fromID); err != nil {
		return err
	}
	if _, err := app.FindRecordById("albums", intoID); err != nil {
		return err
	}

	tracks, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": fromID})
	if err != nil {
		return err
	}
	ids := make([]string, len(tracks))
	for i, track := range tracks {
		ids[i] = track.Id
	}

	if err := carryAlbumRatings(app, fromID, intoID); err != nil {
		return err
	}
	return MoveTracks(app, ids, intoID)
}

// NewAlbumFromTracks gathers tracks into an album of the given name, credited to the artist of
// the first track, and fetches the cover of that track when the album has none.
func NewAlbumFromTracks(ctx context.Context, app core.App, trackIDs []string, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("the name cannot be empty")
	}
	if len(trackIDs) == 0 {
		return "", errors.New("no track to put in the album")
	}

	first, err := app.FindRecordById("tracks", trackIDs[0])
	if err != nil {
		return "", err
	}
	artists := first.GetStringSlice("artists")
	if len(artists) == 0 {
		return "", errors.New("the first track has no artist to credit the album to")
	}

	album, err := getOrCreate(app, "albums", "name = {:n} && artists ~ {:a}", dbx.Params{"n": name, "a": artists[0]}, func(r *core.Record) {
		r.Set("name", name)
		r.Set("artists", artists)
	})
	if err != nil {
		return "", err
	}

	if err := MoveTracks(app, trackIDs, album.Id); err != nil {
		deleteIfUnused(app, "albums", album.Id, "album = {:id}")
		return "", err
	}

	if album.GetString("cover") == "" {
		var meta domain.TrackMetadata
		_ = first.UnmarshalJSONField("metadata", &meta)
		if meta.CoverArtURL != "" {
			setCoverFromURL(ctx, app, album, meta.CoverArtURL)
		}
	}
	return album.Id, nil
}

func carryAlbumRatings(app core.App, fromID, intoID string) error {
	ratings, err := app.FindRecordsByFilter("album_ratings", "album = {:a}", "", 0, 0, dbx.Params{"a": fromID})
	if err != nil {
		return err
	}
	for _, rating := range ratings {
		user := rating.GetString("user")
		if _, err := getOrCreate(app, "album_ratings", "user = {:u} && album = {:a}", dbx.Params{"u": user, "a": intoID}, func(r *core.Record) {
			r.Set("user", user)
			r.Set("album", intoID)
			r.Set("value", rating.GetString("value"))
		}); err != nil {
			return err
		}
	}
	return nil
}
