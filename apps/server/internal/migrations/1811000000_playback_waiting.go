package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The playback record says when a run is still waiting for its first sound, so
// that a client watching another device does not count a playhead over silence.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}

		if col.Fields.GetByName("waiting") == nil {
			col.Fields.Add(&core.BoolField{Name: "waiting"})
		}

		col.Fields = orderFields(col.Fields)
		return app.Save(col)
	}, nil)
}
