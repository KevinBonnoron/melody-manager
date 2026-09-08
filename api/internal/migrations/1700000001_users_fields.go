package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The app extends the default PocketBase users collection with custom fields.
// PB v0.39 bootstraps a base users collection (id _pb_users_auth_) but without
// these, so add them idempotently. `role` drives the admin checks used across
// the API (@request.auth.role = "admin").
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		if users.Fields.GetByName("name") == nil {
			users.Fields.Add(&core.TextField{Name: "name", Max: 255})
		}
		if users.Fields.GetByName("avatar") == nil {
			users.Fields.Add(&core.FileField{
				Name:      "avatar",
				MaxSelect: 1,
				MimeTypes: []string{"image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"},
			})
		}
		if users.Fields.GetByName("onboardingDone") == nil {
			users.Fields.Add(&core.BoolField{Name: "onboardingDone"})
		}
		if users.Fields.GetByName("role") == nil {
			users.Fields.Add(&core.SelectField{
				Name:      "role",
				Required:  true,
				MaxSelect: 1,
				Values:    []string{"user", "admin"},
			})
		}

		return app.Save(users)
	}, func(app core.App) error {
		return nil
	})
}
