// Package hooks ports the PocketBase JS hooks (db/pb_hooks) to Go.
package hooks

import (
	"os"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Register wires the lifecycle hooks onto the app.
func Register(app core.App) {
	// First registered user becomes admin, the rest are regular users.
	// Registration can be disabled (except for the very first user).
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		count, err := e.App.CountRecords("users")
		if err != nil {
			return err
		}
		isFirstUser := count == 0
		if !isFirstUser && os.Getenv("REGISTRATION_DISABLED") == "true" {
			return apis.NewForbiddenError("Registration is disabled", nil)
		}
		role := "user"
		if isFirstUser {
			role = "admin"
		}
		e.Record.Set("role", role)
		return e.Next()
	})

	// PocketBase rules are record-level, so the users updateRule
	// ("id = @request.auth.id") lets a user PATCH any field of their own
	// record, role included — and role is the only gate on the admin routes.
	// Pin it to its stored value for everyone but superusers.
	app.OnRecordUpdateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.HasSuperuserAuth() {
			return e.Next()
		}
		stored, err := e.App.FindRecordById("users", e.Record.Id)
		if err != nil {
			return err
		}
		e.Record.Set("role", stored.GetString("role"))
		return e.Next()
	})

	// Bootstrap a superuser from env if none exists (headless/docker). Unlike
	// the JS hook it no-ops instead of failing when the env is unset, so
	// `task dev` works without it.
	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		email := os.Getenv("PB_SUPERUSER_EMAIL")
		password := os.Getenv("PB_SUPERUSER_PASSWORD")
		if email == "" || password == "" {
			return nil
		}
		if n, _ := e.App.CountRecords(core.CollectionNameSuperusers); n > 0 {
			return nil
		}
		col, err := e.App.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if err != nil {
			return err
		}
		rec := core.NewRecord(col)
		rec.SetEmail(email)
		rec.SetPassword(password)
		return e.App.Save(rec)
	})

	// provider_settings.config carries server-level settings including secrets
	// (the Spotify client secret), but the collection has to stay readable so
	// the UI can show which sources exist and whether they are configured.
	// Serve the values to admins only; everyone else gets an empty object,
	// which is what an unconfigured provider already looks like.
	app.OnRecordEnrich("provider_settings").BindFunc(func(e *core.RecordEnrichEvent) error {
		if !isAdminRequest(e.RequestInfo) {
			e.Record.Set("config", map[string]any{})
		}
		return e.Next()
	})
}

func isAdminRequest(info *core.RequestInfo) bool {
	if info == nil || info.Auth == nil {
		return false
	}
	if info.Auth.Collection() != nil && info.Auth.Collection().Name == core.CollectionNameSuperusers {
		return true
	}
	return info.Auth.GetString("role") == "admin"
}
