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

// Speaker addresses move out of the operator's configuration file and into the
// Sonos source's own settings, beside the music directory of one source and the
// download path of another. They only concern a deployment that owns a speaker,
// which is not what the configuration file is for, and there they had no screen:
// the file was the only way to set them.
//
// The file is read directly rather than through the settings store, which the
// migrations do not carry, and is left as it is. The field simply stops being
// read.
func init() {
	m.Register(func(app core.App) error {
		// A migration that fails is run again; one that returns nil is recorded as
		// applied and never looked at twice. An unreadable or malformed file must
		// therefore travel: swallowed, it would take the addresses with it, and on
		// a bridged network where discovery finds nothing those addresses are the
		// only way to reach a speaker.
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

		// Only "there is no row" means there is no row. Any other failure is a
		// failure: taken for absence it would build a second one, which the unique
		// index on type refuses, reporting a duplicate where the truth was that
		// the query did not run.
		rec, err := app.FindFirstRecordByFilter("provider_config", "type = {:t}", dbx.Params{"t": "sonos"})
		if errors.Is(err, sql.ErrNoRows) {
			rec = core.NewRecord(col)
			rec.Set("type", "sonos")
		} else if err != nil {
			return err
		}

		// A decode failure used to become an empty map, which this then saved over
		// whatever was there. Nothing else validates a migration's write, so the
		// configuration a deployment already had would have gone, silently. Better
		// to refuse: the migration is not recorded, the operator sees why, and the
		// data is still there when it runs again.
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

		// Merged rather than skipped when something is already there. An entry
		// that exists was decided about and keeps exactly the state it was given;
		// an address that only ever lived in the file would otherwise be dropped
		// for having a single speaker beside it.
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
			// Skipped rather than fatal, unlike the cases above. Those risk
			// destroying a configuration that exists; this is an address that could
			// never have reached a speaker anyway, and refusing to boot over a typo
			// in a field that has just been retired helps nobody. It is named, so
			// it is not lost quietly.
			if !services.ValidSpeakerAddress(address) {
				slog.Warn("legacy sonos address is not an IPv4 address, not migrated", "address", address)
				continue
			}
			known[address] = true
			// Enabled, because they were in use: the file held the ones the
			// server was told to try.
			entries = append(entries, map[string]any{"address": address, "enabled": true})
		}
		cfg[services.SpeakerField] = entries
		rec.Set("config", cfg)
		return app.Save(rec)
	}, func(app core.App) error {
		return nil
	})
}

// A deployment that never had a configuration file has nothing to carry over,
// which is not a failure. Anything else is.
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
