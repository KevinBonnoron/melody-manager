package migrations

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		for _, spec := range []struct{ entity, target, from, dislikes string }{
			{"track", "tracks", "track_likes", "track_dislikes"},
			{"album", "albums", "album_likes", ""},
			{"artist", "artists", "artist_likes", ""},
			{"playlist", "playlists", "playlist_likes", ""},
		} {
			name := spec.entity + "_ratings"
			if _, err := app.FindCollectionByNameOrId(name); err == nil {
				continue
			}

			target, err := app.FindCollectionByNameOrId(spec.target)
			if err != nil {
				return err
			}

			owner := "user = @request.auth.id"
			ratings := core.NewBaseCollection(name)
			ratings.Fields.Add(
				&core.RelationField{Name: "user", Required: true, MaxSelect: 1, CascadeDelete: true, CollectionId: users.Id},
				&core.RelationField{Name: spec.entity, Required: true, MaxSelect: 1, CascadeDelete: true, CollectionId: target.Id},
				&core.SelectField{Name: "value", Required: true, MaxSelect: 1, Values: []string{"like", "dislike"}},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			ratings.AddIndex(fmt.Sprintf("idx_%s_ratings_user_%s", spec.entity, spec.entity), true, "user, "+spec.entity, "")
			ratings.AddIndex(fmt.Sprintf("idx_%s_ratings_user", spec.entity), false, "user", "")
			ratings.ListRule = types.Pointer(owner)
			ratings.ViewRule = types.Pointer(owner)
			ratings.CreateRule = types.Pointer(owner)
			ratings.UpdateRule = types.Pointer(owner)
			ratings.DeleteRule = types.Pointer(owner)
			if err := app.Save(ratings); err != nil {
				return err
			}

			if err := carryOver(app, spec.from, name, spec.entity, "like"); err != nil {
				return err
			}
			if spec.dislikes != "" {
				if err := carryOver(app, spec.dislikes, name, spec.entity, "dislike"); err != nil {
					return err
				}
			}
		}

		for _, old := range []string{"track_likes", "track_dislikes", "album_likes", "artist_likes", "playlist_likes"} {
			if c, err := app.FindCollectionByNameOrId(old); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}

		return nil
	}, nil)
}

func carryOver(app core.App, from, to, entity, value string) error {
	if _, err := app.FindCollectionByNameOrId(from); err != nil {
		return nil
	}
	records, err := app.FindAllRecords(from)
	if err != nil {
		return err
	}
	collection, err := app.FindCollectionByNameOrId(to)
	if err != nil {
		return err
	}

	for _, record := range records {
		user, target := record.GetString("user"), record.GetString(entity)
		if user == "" || target == "" {
			continue
		}
		if _, err := app.FindFirstRecordByFilter(to, "user = {:u} && "+entity+" = {:t}", dbx.Params{"u": user, "t": target}); err == nil {
			continue
		}

		rating := core.NewRecord(collection)
		rating.Set("user", user)
		rating.Set(entity, target)
		rating.Set("value", value)
		if err := app.Save(rating); err != nil {
			return err
		}
	}

	return nil
}
