package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		sessions := core.NewBaseCollection("user_sessions")
		sessions.Fields.Add(
			&core.RelationField{Name: "user", Required: true, CollectionId: users.Id, CascadeDelete: true, MaxSelect: 1},
			&core.TextField{Name: "ipAddress", Max: 100},
			&core.TextField{Name: "userAgent", Max: 1000},
			&core.DateField{Name: "expiresAt", Required: true},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		sessions.AddIndex("idx_user_sessions_user", false, "user", "")
		return app.Save(sessions)
	}, func(app core.App) error {
		sessions, err := app.FindCollectionByNameOrId("user_sessions")
		if err != nil {
			return nil
		}
		return app.Delete(sessions)
	})
}
