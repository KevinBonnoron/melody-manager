package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Server-level provider configuration moves out of provider_settings into its
// own admin-only collection. provider_settings stayed readable by every
// authenticated user, it has to be, the sources screens list what exists, so
// anything stored in its `config` leaked, the Spotify client secret included.
func init() {
	m.Register(func(app core.App) error {
		admin := "@request.auth.role = \"admin\""

		cfgCollection, err := app.FindCollectionByNameOrId("provider_config")
		if err != nil {
			cfgCollection = core.NewBaseCollection("provider_config")
			cfgCollection.Fields.Add(
				&core.TextField{Name: "type", Required: true, Max: 50},
				&core.JSONField{Name: "config", MaxSize: 2_000_000},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			cfgCollection.AddIndex("idx_provider_config_type", true, "type", "")
			cfgCollection.ListRule = types.Pointer(admin)
			cfgCollection.ViewRule = types.Pointer(admin)
			cfgCollection.CreateRule = types.Pointer(admin)
			cfgCollection.UpdateRule = types.Pointer(admin)
			cfgCollection.DeleteRule = types.Pointer(admin)
			if err := app.Save(cfgCollection); err != nil {
				return err
			}
		}

		settings, err := app.FindCollectionByNameOrId("provider_settings")
		if err != nil {
			return err
		}

		if settings.Fields.GetByName("config") != nil {
			records, err := app.FindAllRecords("provider_settings")
			if err != nil {
				return err
			}

			for _, rec := range records {
				var cfg map[string]any
				if err := rec.UnmarshalJSONField("config", &cfg); err != nil || len(cfg) == 0 {
					continue
				}

				moved := core.NewRecord(cfgCollection)
				moved.Set("type", rec.GetString("type"))
				moved.Set("config", cfg)
				if err := app.Save(moved); err != nil {
					return err
				}
			}

			settings.Fields.RemoveByName("config")
			if err := app.Save(settings); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("provider_config"); err == nil {
			return app.Delete(c)
		}
		return nil
	})
}
