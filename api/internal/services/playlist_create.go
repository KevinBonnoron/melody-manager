package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// CreatePlaylist makes a manual playlist and puts it in the user's library,
// which is the only thing that makes it visible to them: every playlist screen
// reads playlist_ratings, not an owner column.
//
// The tracks it starts with are part of the same write. Adding them afterwards
// would leave an empty playlist behind whenever that second call failed, and
// the obvious retry would make a second one.
func CreatePlaylist(app core.App, userID, name, description string, trackIDs []string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("playlists")
	if err != nil {
		return nil, err
	}

	playlist := core.NewRecord(collection)
	playlist.Set("name", name)
	playlist.Set("description", description)
	playlist.Set("type", "manual")
	playlist.Set("tracks", trackIDs)

	// Both writes or neither: a playlist saved without its rating belongs to
	// nobody, and no screen would ever show it again.
	if err := app.RunInTransaction(func(txApp core.App) error {
		if err := txApp.Save(playlist); err != nil {
			return err
		}

		_, err := getOrCreate(txApp, "playlist_ratings", "user = {:u} && playlist = {:p}",
			dbx.Params{"u": userID, "p": playlist.Id}, func(r *core.Record) {
				r.Set("user", userID)
				r.Set("playlist", playlist.Id)
				r.Set("value", "like")
			})
		return err
	}); err != nil {
		return nil, err
	}

	return playlist, nil
}
