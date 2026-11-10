package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}

		if col.Fields.GetByName("beganAt") == nil {
			col.Fields.Add(&core.DateField{Name: "beganAt"})
		}

		col.Fields = orderFields(col.Fields)
		return app.Save(col)
	}, nil)
}
