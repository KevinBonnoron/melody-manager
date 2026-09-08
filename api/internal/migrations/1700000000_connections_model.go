package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Connections & providers model (see docs/design/connections-and-providers.md).
//
//   - provider_settings: admin-only, one row per provider type. Server-level
//     config + a server-wide enable flag. Secrets (e.g. spotify clientSecret)
//     live here and must never be readable by regular users → rules left nil
//     (superuser only).
//   - connections: per-user linkage. User-level config only (youtube cookies,
//     spotify OAuth token/refresh/expiry inside config, empty = opt-in for
//     anonymous sources). Owner-only access.
func init() {
	m.Register(func(app core.App) error {
		settings := core.NewBaseCollection("provider_settings")
		settings.Fields.Add(
			&core.TextField{Name: "type", Required: true, Max: 50},
			&core.BoolField{Name: "enabled"},
			&core.JSONField{Name: "config", MaxSize: 2_000_000},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		settings.AddIndex("idx_provider_settings_type", true, "type", "")
		if err := app.Save(settings); err != nil {
			return err
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

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

		owner := "user = @request.auth.id"
		authed := "@request.auth.id != \"\""
		connections.ListRule = types.Pointer(owner)
		connections.ViewRule = types.Pointer(owner)
		connections.CreateRule = types.Pointer(authed)
		connections.UpdateRule = types.Pointer(owner)
		connections.DeleteRule = types.Pointer(owner)

		return app.Save(connections)
	}, func(app core.App) error {
		for _, name := range []string{"connections", "provider_settings"} {
			if c, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
