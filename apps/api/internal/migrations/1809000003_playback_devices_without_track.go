package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// The playback record outlives the track it held: the places the sound comes
// out of are kept between plays, so a device that claimed the playback stays
// in the set while nothing is playing. A track the record no longer names must
// not stand in the way of keeping that.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}

		if field, ok := col.Fields.GetByName("track").(*core.RelationField); ok {
			field.Required = false
		}

		col.Fields = orderFields(col.Fields)
		return app.Save(col)
	}, nil)
}
