package migrations

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

//go:embed snapshot.json
var snapshotJSON []byte

// Domain collections are imported verbatim from the legacy PocketBase snapshot
// (db/pb_migrations) so the data model stays faithful, EXCEPT:
//   - system collections + users are skipped (PB bootstraps its own; users
//     fields are added in 1700000001).
//   - providers / provider_grants / connections are dropped — replaced by the
//     redesigned provider_settings + connections (1700000000).
//   - tracks.provider (a relation to the old providers collection) becomes a
//     plain `source` text field holding the provider type (e.g. "youtube").
var domainCollections = map[string]bool{
	"tracks": true, "artists": true, "albums": true, "genres": true,
	"track_likes": true, "album_likes": true, "artist_likes": true,
	"track_dislikes": true, "track_plays": true, "share_links": true,
	"playlists": true, "playlist_likes": true,
}

func init() {
	m.Register(func(app core.App) error {
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

		return app.ImportCollections(toImport, false)
	}, func(app core.App) error {
		order := []string{
			"playlist_likes", "playlists", "share_links", "track_plays",
			"track_dislikes", "artist_likes", "album_likes", "track_likes",
			"tracks", "albums", "artists", "genres",
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
			"id":                  "text_source",
			"name":                "source",
			"type":                "text",
			"max":                 50,
			"min":                 0,
			"pattern":             "",
			"autogeneratePattern": "",
			"required":            false,
			"presentable":         false,
			"primaryKey":          false,
			"system":              false,
			"hidden":              false,
		}
	}
	tracks["fields"] = fields
}
