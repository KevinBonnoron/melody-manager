package migrations

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

//go:embed snapshot.json
var snapshotJSON []byte

// Initial schema for the Go backend. Consolidates the provider/connection
// redesign (docs/guide/configuration.md), the custom users fields,
// the legacy domain collections, and the provider_settings seed into a single
// migration. Each step is idempotent so it applies cleanly to both a fresh DB
// and one created during development.
//
//   - provider_settings: admin-only writes, authenticated reads. config may hold
//     server-level settings incl. secrets (spotify clientSecret) — masking those
//     from non-admin reads is a follow-up.
//   - connections: per-user linkage, owner-only.
//   - tracks.provider (relation to the dropped providers collection) becomes a
//     `source` text field holding the provider type.
var domainCollections = map[string]bool{
	"tracks": true, "artists": true, "albums": true, "genres": true,
	"track_likes": true, "album_likes": true, "artist_likes": true,
	"track_dislikes": true, "track_plays": true, "share_links": true,
	"playlists": true, "playlist_likes": true,
}

func init() {
	m.Register(func(app core.App) error {
		authed := "@request.auth.id != \"\""
		admin := "@request.auth.role = \"admin\""
		owner := "user = @request.auth.id"

		// provider_settings
		if _, err := app.FindCollectionByNameOrId("provider_settings"); err != nil {
			settings := core.NewBaseCollection("provider_settings")
			settings.Fields.Add(
				&core.TextField{Name: "type", Required: true, Max: 50},
				&core.TextField{Name: "category", Max: 20},
				&core.BoolField{Name: "enabled"},
				&core.JSONField{Name: "config", MaxSize: 2_000_000},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			settings.AddIndex("idx_provider_settings_type", true, "type", "")
			settings.ListRule = types.Pointer(authed)
			settings.ViewRule = types.Pointer(authed)
			settings.CreateRule = types.Pointer(admin)
			settings.UpdateRule = types.Pointer(admin)
			settings.DeleteRule = types.Pointer(admin)
			if err := app.Save(settings); err != nil {
				return err
			}
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// connections
		if existing, err := app.FindCollectionByNameOrId("connections"); err == nil {
			if err := migrateLegacyConnections(app, existing); err != nil {
				return err
			}
		} else {
			connections := core.NewBaseCollection("connections")
			connections.Fields.Add(
				&core.RelationField{Name: "user", Required: true, CollectionId: users.Id, CascadeDelete: true, MaxSelect: 1},
				&core.TextField{Name: "type", Required: true, Max: 50},
				&core.BoolField{Name: "enabled"},
				&core.JSONField{Name: "config", MaxSize: 2_000_000},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			connections.AddIndex("idx_connections_user_type", true, "user, type", "")
			connections.ListRule = types.Pointer(owner)
			connections.ViewRule = types.Pointer(owner)
			connections.CreateRule = types.Pointer(authed)
			connections.UpdateRule = types.Pointer(owner)
			connections.DeleteRule = types.Pointer(owner)
			if err := app.Save(connections); err != nil {
				return err
			}
		}

		// users custom fields
		usersChanged := false
		if users.Fields.GetByName("name") == nil {
			users.Fields.Add(&core.TextField{Name: "name", Max: 255})
			usersChanged = true
		}
		if users.Fields.GetByName("avatar") == nil {
			users.Fields.Add(&core.FileField{Name: "avatar", MaxSelect: 1, MimeTypes: []string{"image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"}})
			usersChanged = true
		}
		if users.Fields.GetByName("onboardingDone") == nil {
			users.Fields.Add(&core.BoolField{Name: "onboardingDone"})
			usersChanged = true
		}
		if users.Fields.GetByName("role") == nil {
			users.Fields.Add(&core.SelectField{Name: "role", Required: true, MaxSelect: 1, Values: []string{"user", "admin"}})
			usersChanged = true
		}
		// users is excluded from domainCollections, so ImportCollections never
		// touches it and the stock owner-only rules would stay in place: an
		// admin listing /admin/users would silently see only themselves.
		ownerOrAdmin := "id = @request.auth.id || " + admin
		if users.ListRule == nil || *users.ListRule != ownerOrAdmin {
			users.ListRule = types.Pointer(ownerOrAdmin)
			usersChanged = true
		}
		if users.ViewRule == nil || *users.ViewRule != ownerOrAdmin {
			users.ViewRule = types.Pointer(ownerOrAdmin)
			usersChanged = true
		}
		if usersChanged {
			if err := app.Save(users); err != nil {
				return err
			}
		}

		// domain collections (imported from the legacy snapshot, filtered)
		var all []map[string]any
		if err := json.Unmarshal(snapshotJSON, &all); err != nil {
			return fmt.Errorf("parse snapshot: %w", err)
		}
		toImport := make([]map[string]any, 0, len(domainCollections))
		for _, c := range all {
			name, _ := c["name"].(string)
			if !domainCollections[name] {
				continue
			}
			if name == "tracks" {
				replaceProviderWithSource(c)
			}
			toImport = append(toImport, c)
		}
		// ImportCollections diffs fields by id, so replaceProviderWithSource
		// drops the provider relation and adds an empty source column. Capture
		// the mapping first or every pre-existing track becomes unplayable.
		legacySources, err := captureLegacySources(app)
		if err != nil {
			return err
		}
		if err := app.ImportCollections(toImport, false); err != nil {
			return err
		}
		if err := backfillSources(app, legacySources); err != nil {
			return err
		}

		// Hot lookup paths: importer/scan dedupe on sourceUrl, and every stats
		// query filters track_plays by user.
		for _, idx := range []struct{ collection, name, cols string }{
			{"tracks", "idx_tracks_sourceUrl", "sourceUrl"},
			{"track_plays", "idx_track_plays_user", "user"},
			{"album_likes", "idx_album_likes_user", "user"},
			{"playlist_likes", "idx_playlist_likes_user", "user"},
		} {
			c, err := app.FindCollectionByNameOrId(idx.collection)
			if err != nil {
				continue
			}
			before := len(c.Indexes)
			c.AddIndex(idx.name, false, idx.cols, "")
			if len(c.Indexes) != before {
				if err := app.Save(c); err != nil {
					return err
				}
			}
		}

		// playlists smart-playlist fields (added by a later legacy migration)
		if playlists, err := app.FindCollectionByNameOrId("playlists"); err == nil {
			plChanged := false
			if playlists.Fields.GetByName("type") == nil {
				playlists.Fields.Add(&core.SelectField{Name: "type", Required: true, MaxSelect: 1, Values: []string{"manual", "smart"}})
				plChanged = true
			}
			if playlists.Fields.GetByName("metadata") == nil {
				playlists.Fields.Add(&core.JSONField{Name: "metadata", MaxSize: 2_000_000})
				plChanged = true
			}
			if plChanged {
				if err := app.Save(playlists); err != nil {
					return err
				}
			}
		}

		// seed provider_settings (one row per known provider type)
		settings, err := app.FindCollectionByNameOrId("provider_settings")
		if err != nil {
			return err
		}
		seeds := []struct{ typ, category string }{
			{"local", "track"}, {"youtube", "track"}, {"soundcloud", "track"},
			{"bandcamp", "track"}, {"spotify", "track"}, {"sonos", "device"},
		}
		for _, s := range seeds {
			if _, err := app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": s.typ}); err == nil {
				continue
			}
			rec := core.NewRecord(settings)
			rec.Set("type", s.typ)
			rec.Set("category", s.category)
			rec.Set("enabled", true)
			rec.Set("config", map[string]any{})
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		order := []string{
			"playlist_likes", "playlists", "share_links", "track_plays",
			"track_dislikes", "artist_likes", "album_likes", "track_likes",
			"tracks", "albums", "artists", "genres", "connections", "provider_settings",
		}
		for _, name := range order {
			if c, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// captureLegacySources reads the tracks.provider -> providers.type mapping that
// ImportCollections is about to destroy. Returns nil on a fresh database.
func captureLegacySources(app core.App) (map[string]string, error) {
	tracks, err := app.FindCollectionByNameOrId("tracks")
	if err != nil || tracks.Fields.GetByName("provider") == nil {
		return nil, nil
	}
	if _, err := app.FindCollectionByNameOrId("providers"); err != nil {
		return nil, nil
	}
	var provs []struct {
		ID   string `db:"id"`
		Type string `db:"type"`
	}
	if err := app.DB().NewQuery("SELECT id, type FROM providers").All(&provs); err != nil {
		return nil, fmt.Errorf("read legacy providers: %w", err)
	}
	typeByID := make(map[string]string, len(provs))
	for _, p := range provs {
		typeByID[p.ID] = p.Type
	}
	var rows []struct {
		ID       string `db:"id"`
		Provider string `db:"provider"`
	}
	if err := app.DB().NewQuery("SELECT id, provider FROM tracks WHERE provider != ''").All(&rows); err != nil {
		return nil, fmt.Errorf("read legacy track providers: %w", err)
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		if t := typeByID[r.Provider]; t != "" {
			out[r.ID] = t
		}
	}
	return out, nil
}

func backfillSources(app core.App, sources map[string]string) error {
	for id, source := range sources {
		q := app.DB().NewQuery("UPDATE tracks SET source = {:s} WHERE id = {:id}")
		q.Bind(dbx.Params{"s": source, "id": id})
		if _, err := q.Execute(); err != nil {
			return fmt.Errorf("backfill source for track %s: %w", id, err)
		}
	}
	return nil
}

// migrateLegacyConnections converts a pre-redesign connections collection
// ({provider relation, user, config, enabled}) to the new {type, ...} shape.
// Without it the collection is left untouched and every per-user provider
// config is silently ignored, because pbx filters on a `type` column.
func migrateLegacyConnections(app core.App, conn *core.Collection) error {
	if conn.Fields.GetByName("type") != nil {
		return nil
	}
	conn.Fields.Add(&core.TextField{Name: "type", Max: 50})
	if err := app.Save(conn); err != nil {
		return fmt.Errorf("add connections.type: %w", err)
	}
	if conn.Fields.GetByName("provider") != nil {
		q := app.DB().NewQuery("UPDATE connections SET type = (SELECT type FROM providers WHERE providers.id = connections.provider) WHERE type = '' OR type IS NULL")
		if _, err := q.Execute(); err != nil {
			return fmt.Errorf("backfill connections.type: %w", err)
		}
		conn.Fields.RemoveByName("provider")
		if err := app.Save(conn); err != nil {
			return fmt.Errorf("drop connections.provider: %w", err)
		}
	}
	return nil
}

func replaceProviderWithSource(tracks map[string]any) {
	fields, ok := tracks["fields"].([]any)
	if !ok {
		return
	}
	for i, raw := range fields {
		f, ok := raw.(map[string]any)
		if !ok || f["name"] != "provider" {
			continue
		}
		fields[i] = map[string]any{
			"id": "text_source", "name": "source", "type": "text",
			"max": 50, "min": 0, "pattern": "", "autogeneratePattern": "",
			"required": false, "presentable": false, "primaryKey": false,
			"system": false, "hidden": false,
		}
	}
	tracks["fields"] = fields
}
