package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		selfOrAdmin := "id = @request.auth.id || @request.auth.role = \"admin\""
		users.UpdateRule = types.Pointer(selfOrAdmin)
		users.DeleteRule = types.Pointer(selfOrAdmin)
		return app.Save(users)
	}, func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		self := "id = @request.auth.id"
		users.UpdateRule = types.Pointer(self)
		users.DeleteRule = types.Pointer(self)
		return app.Save(users)
	})
}
