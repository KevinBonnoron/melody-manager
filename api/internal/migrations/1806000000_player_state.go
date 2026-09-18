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

		if col.Fields.GetByName("positionAt") == nil {
			col.Fields.Add(&core.DateField{Name: "positionAt"})
		}
		if col.Fields.GetByName("playing") == nil {
			col.Fields.Add(&core.BoolField{Name: "playing"})
		}
		if col.Fields.GetByName("device") == nil {
			col.Fields.Add(&core.TextField{Name: "device", Max: 128})
		}
		if col.Fields.GetByName("queueIndex") == nil {
			col.Fields.Add(&core.NumberField{Name: "queueIndex"})
		}
		if col.Fields.GetByName("shuffle") == nil {
			col.Fields.Add(&core.BoolField{Name: "shuffle"})
		}
		if col.Fields.GetByName("repeat") == nil {
			col.Fields.Add(&core.SelectField{Name: "repeat", Values: []string{"none", "all", "one"}, MaxSelect: 1})
		}
		if col.Fields.GetByName("order") == nil {
			col.Fields.Add(&core.JSONField{Name: "order", MaxSize: 1 << 20})
		}

		col.Fields = orderFields(col.Fields)
		return app.Save(col)
	}, nil)
}
