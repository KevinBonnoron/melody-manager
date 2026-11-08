package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		links, err := app.FindCollectionByNameOrId("share_links")
		if err != nil {
			return err
		}
		if links.Fields.GetByName("plays") != nil {
			return nil
		}

		links.Fields.Add(&core.NumberField{Name: "plays", OnlyInt: true})
		return app.Save(links)
	}, nil)
}
