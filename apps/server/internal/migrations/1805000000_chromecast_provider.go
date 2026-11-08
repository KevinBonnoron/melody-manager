package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": "chromecast"}); err == nil {
			return nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		settings, err := app.FindCollectionByNameOrId("provider_settings")
		if err != nil {
			return err
		}

		rec := core.NewRecord(settings)
		rec.Set("type", "chromecast")
		rec.Set("category", "device")
		rec.Set("enabled", false)
		rec.Set("config", map[string]any{})
		return app.Save(rec)
	}, func(app core.App) error {
		rec, err := app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": "chromecast"})
		if err != nil {
			return nil
		}
		return app.Delete(rec)
	})
}
