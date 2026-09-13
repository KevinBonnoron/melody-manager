package migrations

import (
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/KevinBonnoron/melody-manager/api/internal/config"
)

// Resume-where-you-left-off, and what a track's audio can be read from.
//
// Every step checks the state it is about to change, so this lands the same way
// on a fresh database and on one that already went through the steps this
// replaces.
func init() {
	m.Register(func(app core.App) error {
		if err := createPlaybackState(app); err != nil {
			return err
		}
		if err := dropCollection(app, "playback_devices"); err != nil {
			return err
		}
		if err := retireSettingsCollection(app); err != nil {
			return err
		}
		return reshapeTracks(app)
	}, nil)
}

// Where a user left off, one row each. Server-side rather than in the browser:
// the point is to resume on another device, which local storage cannot do, and
// the queue travels with the position or nothing follows the resumed track.
func createPlaybackState(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("playback_state"); err == nil {
		return nil
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	tracks, err := app.FindCollectionByNameOrId("tracks")
	if err != nil {
		return err
	}

	owner := "user = @request.auth.id"
	col := core.NewBaseCollection("playback_state")
	col.Fields.Add(
		&core.NumberField{Name: "position"},
		&core.JSONField{Name: "queue", MaxSize: 1 << 20},
		&core.RelationField{Name: "user", Required: true, MaxSelect: 1, CollectionId: users.Id, CascadeDelete: true},
		&core.RelationField{Name: "track", Required: true, MaxSelect: 1, CollectionId: tracks.Id, CascadeDelete: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	col.AddIndex("idx_playback_state_user", true, "user", "")
	col.ListRule = types.Pointer(owner)
	col.ViewRule = types.Pointer(owner)
	col.CreateRule = types.Pointer("@request.auth.id != \"\"")
	col.UpdateRule = types.Pointer(owner)
	col.DeleteRule = types.Pointer(owner)
	return app.Save(col)
}

// Operator settings live in a JSON file: they have to stay editable when the
// server will not start, and a publicly readable collection was a wide door for
// a single flag. The value is carried over first, or an instance that allowed
// registration would come back closed.
func retireSettingsCollection(app core.App) error {
	col, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		return nil
	}

	if rec, err := app.FindFirstRecordByFilter("settings", "id != ''"); err == nil {
		path := config.DefaultPath()
		if store, _, err := config.Load(path); err == nil {
			next := store.Get()
			next.RegistrationAllowed = !rec.GetBool("registrationDisabled")
			if err := store.Save(next); err != nil {
				slog.Warn("registration setting not carried over", "path", path, "error", err)
			}
		} else {
			slog.Warn("registration setting not carried over", "path", path, "error", err)
		}
	}

	return app.Delete(col)
}

// reshapeTracks renames `sourceUrl` to `origin`, it says where a track comes
// from and never changes, where the old name suggested a companion to `source`
// (the provider type) that it never was, and replaces the stored cache address
// with where the audio can be read from.
//
// `metadata.localPath` goes: the downloader builds that path from the track and
// its album, so it is derived rather than remembered. What cannot be derived is
// whether the file is there, and that is `availability`, stored rather than
// computed on read so a file appearing or vanishing reaches every open client
// over realtime.
func reshapeTracks(app core.App) error {
	tracks, err := app.FindCollectionByNameOrId("tracks")
	if err != nil {
		return err
	}

	if field := tracks.Fields.GetByName("sourceUrl"); field != nil {
		field.SetName("origin")
		// Indexes name their columns in raw SQL, so renaming the field alone
		// leaves them pointing at a column that no longer exists.
		for i, idx := range tracks.Indexes {
			tracks.Indexes[i] = strings.NewReplacer("sourceUrl", "origin").Replace(idx)
		}
	}

	// Earlier shapes of the same idea, each needing the track's source to mean
	// anything.
	tracks.Fields.RemoveByName("unavailable")
	tracks.Fields.RemoveByName("hasFile")
	if tracks.Fields.GetByName("availability") == nil {
		tracks.Fields.Add(&core.SelectField{
			Name:      "availability",
			Values:    []string{"file", "stream", "none"},
			MaxSelect: 1,
		})
	}

	tracks.Fields = orderFields(tracks.Fields)
	if err := app.Save(tracks); err != nil {
		return err
	}

	// The startup check fills availability in within seconds, so only the stale
	// cache address has to be cleaned out here.
	records, err := app.FindAllRecords("tracks")
	if err != nil {
		return err
	}
	for _, rec := range records {
		raw := rec.GetString("metadata")
		if raw == "" {
			continue
		}

		var meta map[string]any
		if err := json.Unmarshal([]byte(raw), &meta); err != nil {
			continue
		}
		if _, ok := meta["localPath"]; !ok {
			continue
		}

		delete(meta, "localPath")
		rec.Set("metadata", meta)
		if err := app.Save(rec); err != nil {
			return err
		}
	}

	return nil
}

func dropCollection(app core.App, name string) error {
	col, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return nil
	}
	return app.Delete(col)
}

// orderFields groups by role while keeping the existing order inside each
// group: id, the record's own values, its relations, then the timestamps. A
// field added later otherwise lands after the dates.
func orderFields(fields core.FieldsList) core.FieldsList {
	var id, values, relations, dates []core.Field
	for _, field := range fields {
		switch {
		case field.GetName() == core.FieldNameId:
			id = append(id, field)
		case field.Type() == core.FieldTypeAutodate:
			dates = append(dates, field)
		case field.Type() == core.FieldTypeRelation:
			relations = append(relations, field)
		default:
			values = append(values, field)
		}
	}

	ordered := make(core.FieldsList, 0, len(fields))
	for _, group := range [][]core.Field{id, values, relations, dates} {
		ordered = append(ordered, group...)
	}
	return ordered
}
