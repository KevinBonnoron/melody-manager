package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const localTrackOriginIndex = "idx_tracks_local_origin"

func migrateLocalTrackOrigins(app core.App) error {
	tracks, err := app.FindRecordsByFilter(
		"tracks",
		"source = {:source} && origin != ''",
		"created,id",
		0,
		0,
		dbx.Params{"source": "local"},
	)
	if err != nil {
		return err
	}

	seen := make(map[string]string, len(tracks))
	replacements := make(map[string]string)
	for _, track := range tracks {
		origin := track.GetString("origin")
		if keeperID := seen[origin]; keeperID != "" {
			replacements[track.Id] = keeperID
			if err := moveTrackReferences(app, track.Id, keeperID); err != nil {
				return err
			}
			if err := app.Delete(track); err != nil {
				return err
			}
			continue
		}
		seen[origin] = track.Id
	}

	states, err := app.FindAllRecords("playback_state")
	if err != nil {
		return err
	}
	for _, state := range states {
		if len(replacements) == 0 {
			break
		}
		changed := false
		if raw := state.GetString("list"); raw == "" || raw == "null" {
			continue
		}
		var list []string
		if err := state.UnmarshalJSONField("list", &list); err != nil {
			return err
		}
		for index, id := range list {
			replacement := replacements[id]
			if replacement == "" || replacement == id {
				continue
			}
			list[index] = replacement
			changed = true
		}
		if !changed {
			continue
		}
		state.Set("list", list)
		if err := app.Save(state); err != nil {
			return err
		}
	}

	_, err = app.DB().NewQuery(
		"CREATE UNIQUE INDEX " + localTrackOriginIndex + " ON tracks (origin) WHERE source = 'local' AND origin != ''",
	).Execute()
	return err
}

func moveTrackReferences(app core.App, duplicateID, keeperID string) error {
	if err := movePlaybackState(app, duplicateID, keeperID); err != nil {
		return err
	}
	params := dbx.Params{"keeper": keeperID, "duplicate": duplicateID}
	for _, collection := range []string{"share_links", "track_plays"} {
		if err := moveSingleTrackReference(app, collection, duplicateID, keeperID); err != nil {
			return err
		}
	}
	if err := movePlaylistTracks(app, duplicateID, keeperID); err != nil {
		return err
	}
	if _, err := app.FindCollectionByNameOrId("track_ratings"); err != nil {
		return nil
	}
	// A user may have rated both copies. Keep the rating attached to the record
	// that survives, and move only ratings that do not collide with it.
	if _, err := app.DB().NewQuery(
		`UPDATE track_ratings SET track = {:keeper}
		 WHERE track = {:duplicate} AND NOT EXISTS (
			SELECT 1 FROM track_ratings AS kept
			WHERE kept."user" = track_ratings."user" AND kept.track = {:keeper}
		 )`,
	).Bind(params).Execute(); err != nil {
		return err
	}
	_, err := app.DB().NewQuery("DELETE FROM track_ratings WHERE track = {:duplicate}").Bind(params).Execute()
	return err
}

func moveSingleTrackReference(app core.App, collection, duplicateID, keeperID string) error {
	if _, err := app.FindCollectionByNameOrId(collection); err != nil {
		return nil
	}
	_, err := app.DB().NewQuery(
		"UPDATE " + collection + " SET track = {:keeper} WHERE track = {:duplicate}",
	).Bind(dbx.Params{"keeper": keeperID, "duplicate": duplicateID}).Execute()
	return err
}

func movePlaylistTracks(app core.App, duplicateID, keeperID string) error {
	if _, err := app.FindCollectionByNameOrId("playlists"); err != nil {
		return nil
	}
	playlists, err := app.FindAllRecords("playlists")
	if err != nil {
		return err
	}
	for _, playlist := range playlists {
		list := playlist.GetStringSlice("tracks")
		changed := false
		hasKeeper := false
		for _, id := range list {
			hasKeeper = hasKeeper || id == keeperID
		}
		updated := make([]string, 0, len(list))
		for _, id := range list {
			if id != duplicateID {
				updated = append(updated, id)
				continue
			}
			changed = true
			if !hasKeeper {
				updated = append(updated, keeperID)
			}
		}
		if !changed {
			continue
		}
		playlist.Set("tracks", updated)
		if err := app.Save(playlist); err != nil {
			return err
		}
	}
	return nil
}

func movePlaybackState(app core.App, duplicateID, keeperID string) error {
	if _, err := app.FindCollectionByNameOrId("playback_state"); err != nil {
		return nil
	}
	_, err := app.DB().NewQuery(
		"UPDATE playback_state SET track = {:keeper} WHERE track = {:duplicate}",
	).Bind(dbx.Params{"keeper": keeperID, "duplicate": duplicateID}).Execute()
	return err
}

func init() {
	m.Register(migrateLocalTrackOrigins, func(app core.App) error {
		_, err := app.DB().NewQuery("DROP INDEX IF EXISTS " + localTrackOriginIndex).Execute()
		return err
	})
}
