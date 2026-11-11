package migrations

import (
	"context"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
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
		albums.Fields = orderFields(albums.Fields)
		if err := app.Save(albums); err != nil {
			return err
		}

		if err := services.SplitLegacyYouTubeAlbums(context.Background(), app); err != nil {
			return err
		}
		return services.BackfillAlbumTypes(app)
	}, nil)
}
