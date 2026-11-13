package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

func init() {
	m.Register(func(app core.App) error {
		albums, err := app.FindCollectionByNameOrId("albums")
		if err != nil {
			return err
		}

		if albums.Fields.GetByName("type") == nil {
			albums.Fields.Add(&core.SelectField{
				Name:      "type",
				MaxSelect: 1,
				Values:    []string{domain.AlbumSingle, domain.AlbumEP, domain.AlbumFull, domain.AlbumMix},
			})
		}
		if albums.Fields.GetByName("typeLocked") == nil {
			albums.Fields.Add(&core.BoolField{Name: "typeLocked"})
		}
		if albums.Fields.GetByName("typeIncomplete") == nil {
			albums.Fields.Add(&core.BoolField{Name: "typeIncomplete"})
		}
		if albums.Fields.GetByName("videoOrigin") == nil {
			albums.Fields.Add(&core.TextField{Name: "videoOrigin"})
		}
		albums.Fields = orderFields(albums.Fields)
		if err := app.Save(albums); err != nil {
			return err
		}

		_, err = app.DB().NewQuery("CREATE TABLE IF NOT EXISTS _album_type_backfill (pending INTEGER NOT NULL)").Execute()
		if err != nil {
			return err
		}
		_, err = app.DB().NewQuery("INSERT INTO _album_type_backfill (pending) VALUES (1)").Execute()
		return err
	}, nil)
}
