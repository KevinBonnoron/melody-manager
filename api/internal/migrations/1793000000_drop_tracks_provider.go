package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

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
