package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The redesign replaced tracks.provider (a required relation to the dropped
// `providers` collection) with tracks.source, and backfilled the values, but
// left the old field in place. It stayed required, and the importer only sets
// `source`, so every new track failed validation with "provider: cannot be
// blank". Existing rows were unaffected: they already had a value.
func init() {
	m.Register(func(app core.App) error {
		tracks, err := app.FindCollectionByNameOrId("tracks")
		if err != nil {
			return err
		}

		if tracks.Fields.GetByName("provider") != nil {
			tracks.Fields.RemoveByName("provider")
			if err := app.Save(tracks); err != nil {
				return err
			}
		}

		// provider_grants was never used by any code and still holds a relation to
		// `providers`, which blocks deleting it. Drop it first, then the legacy
		// collection: the client reads provider_settings, and the Go side reads
		// provider_settings/provider_config.
		for _, name := range []string{"provider_grants", "providers"} {
			if legacy, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(legacy); err != nil {
					return err
				}
			}
		}

		return nil
	}, nil)
}
