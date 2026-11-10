package migrations

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}

		if field := col.Fields.GetByName("queue"); field != nil {
			field.SetName("list")
			for i, idx := range col.Indexes {
				col.Indexes[i] = strings.ReplaceAll(idx, "queue", "list")
			}
		}

		add := []core.Field{
			&core.DateField{Name: "positionAt"},
			&core.BoolField{Name: "playing"},
			&core.JSONField{Name: "devices", MaxSize: 1 << 16},
			&core.JSONField{Name: "order", MaxSize: 1 << 20},
			&core.NumberField{Name: "index"},
			&core.BoolField{Name: "shuffle"},
			&core.SelectField{Name: "repeat", Values: []string{"none", "all", "one"}, MaxSelect: 1},
		}
		for _, field := range add {
			if col.Fields.GetByName(field.GetName()) == nil {
				col.Fields.Add(field)
			}
		}

		col.Fields = orderFields(col.Fields)
		return app.Save(col)
	}, nil)
}
