package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(allowUserSessionRead, func(app core.App) error {
		sessions, err := app.FindCollectionByNameOrId("user_sessions")
		if err != nil {
			return nil
		}
		sessions.ListRule = nil
		sessions.ViewRule = nil
		return app.Save(sessions)
	})
}

// allowUserSessionRead also runs for installations that already applied the
// original, superuser-only user_sessions migration.
func allowUserSessionRead(app core.App) error {
	sessions, err := app.FindCollectionByNameOrId("user_sessions")
	if err != nil {
		return err
	}
	owner := "user = @request.auth.id"
	sessions.ListRule = types.Pointer(owner)
	sessions.ViewRule = types.Pointer(owner)
	return app.Save(sessions)
}
