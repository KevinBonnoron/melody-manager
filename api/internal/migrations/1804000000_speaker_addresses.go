package migrations

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"

	"github.com/KevinBonnoron/melody-manager/api/internal/config"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
)

func init() {
	m.Register(func(app core.App) error {
		addresses, err := speakerAddressesFromFile(config.DefaultPath())
		if err != nil {
			return err
		}
		if len(addresses) == 0 {
			return nil
		}

		col, err := app.FindCollectionByNameOrId("provider_config")
		if err != nil {
			return err
		}

		rec, err := app.FindFirstRecordByFilter("provider_config", "type = {:t}", dbx.Params{"t": "sonos"})
		if errors.Is(err, sql.ErrNoRows) {
			rec = core.NewRecord(col)
			rec.Set("type", "sonos")
		} else if err != nil {
			return err
		}

		var cfg map[string]any
		if raw := rec.GetString("config"); raw != "" && raw != "null" {
			if err := rec.UnmarshalJSONField("config", &cfg); err != nil {
				return fmt.Errorf("reading the stored sonos configuration: %w", err)
			}
			if cfg == nil {
				return errors.New("the stored sonos configuration is not an object")
			}
		} else {
			cfg = map[string]any{}
		}

		var entries []any
		if raw, present := cfg[services.SpeakerField]; present && raw != nil {
			list, ok := raw.([]any)
			if !ok {
				return errors.New("the stored sonos speakers are not a list")
			}
			entries = list
		}

		known := map[string]bool{}
		for _, entry := range entries {
			m, ok := entry.(map[string]any)
			if !ok {
				return errors.New("a stored sonos speaker is not an object")
			}
			address, ok := m["address"].(string)
			if !ok {
				return errors.New("a stored sonos speaker has no address")
			}
			known[strings.TrimSpace(address)] = true
		}

		for _, address := range addresses {
			address = strings.TrimSpace(address)
			if address == "" || known[address] {
				continue
			}
			if !services.ValidSpeakerAddress(address) {
				slog.Warn("legacy sonos address is not an IPv4 address, not migrated", "address", address)
				continue
			}
			known[address] = true
			entries = append(entries, map[string]any{"address": address, "enabled": true})
		}
		cfg[services.SpeakerField] = entries
		rec.Set("config", cfg)
		return app.Save(rec)
	}, func(app core.App) error {
		return nil
	})
}

func speakerAddressesFromFile(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var file struct {
		SonosAddresses []string `json:"sonosAddresses"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	return file.SonosAddresses, nil
}
