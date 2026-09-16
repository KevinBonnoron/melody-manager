// Package hooks ports the PocketBase JS hooks (db/pb_hooks) to Go.
package hooks

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/config"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/watcher"
)

// Register wires the lifecycle hooks onto the app.
func Register(app core.App, settings *config.Store) {
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		return inTransaction(e, func(txApp core.App) error {
			count, err := txApp.CountRecords("users")
			if err != nil {
				return err
			}
			if count == 0 {
				e.Record.Set("role", "admin")
			} else if e.Record.GetString("role") == "" {
				e.Record.Set("role", "user")
			}
			return e.Next()
		})
	})

	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetString("role") == "admin") {
			return e.Next()
		}

		e.Record.Set("role", "")
		return inRequestTransaction(e, func(txApp core.App) error {
			count, err := txApp.CountRecords("users")
			if err != nil {
				return err
			}
			if count > 0 && !settings.Get().RegistrationAllowed {
				return apis.NewForbiddenError("Registration is disabled", nil)
			}
			return e.Next()
		})
	})

	app.OnRecordUpdateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.HasSuperuserAuth() {
			return e.Next()
		}
		stored, err := e.App.FindRecordById("users", e.Record.Id)
		if err != nil {
			return err
		}

		auth := e.Auth
		editingSomeoneElse := auth != nil && auth.Id != e.Record.Id
		if !(editingSomeoneElse && auth.GetString("role") == "admin") {
			e.Record.Set("role", stored.GetString("role"))
		}

		if stored.GetString("role") == "admin" && e.Record.GetString("role") != "admin" {
			return inRequestTransaction(e, func(txApp core.App) error {
				if err := requireAnotherAdmin(txApp, e.Record.Id); err != nil {
					return err
				}
				return e.Next()
			})
		}

		return e.Next()
	})

	app.OnRecordDeleteRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Record.GetString("role") != "admin" {
			return e.Next()
		}

		return inRequestTransaction(e, func(txApp core.App) error {
			if err := requireAnotherAdmin(txApp, e.Record.Id); err != nil {
				return err
			}
			return e.Next()
		})
	})

	app.OnRecordEnrich("users").BindFunc(func(e *core.RecordEnrichEvent) error {
		if e.RequestInfo != nil && e.RequestInfo.Auth != nil && e.RequestInfo.Auth.GetString("role") == "admin" {
			e.Record.IgnoreEmailVisibility(true)
		}
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("track_plays", "track_ratings").BindFunc(func(e *core.RecordEvent) error {
		if uid := e.Record.GetString("user"); uid != "" {
			go services.RefreshSmartPlaylists(e.App, uid)
		}
		return e.Next()
	})

	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		email := os.Getenv("PB_SUPERUSER_EMAIL")
		password := os.Getenv("PB_SUPERUSER_PASSWORD")
		if email == "" || password == "" {
			return nil
		}
		if n, _ := e.App.CountRecords(core.CollectionNameSuperusers); n > 0 {
			return nil
		}
		col, err := e.App.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if err != nil {
			return err
		}
		rec := core.NewRecord(col)
		rec.SetEmail(email)
		rec.SetPassword(password)
		return e.App.Save(rec)
	})

	app.OnRecordCreateRequest("provider_config").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := validateProviderConfig(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})
	app.OnRecordUpdateRequest("provider_config").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := validateProviderConfig(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordCreateRequest("provider_settings").BindFunc(func(e *core.RecordRequestEvent) error {
		if !e.Record.GetBool("enabled") {
			return e.Next()
		}
		if err := validateEnabledProvider(e.App, e.Record.GetString("type")); err != nil {
			return err
		}
		return e.Next()
	})
	app.OnRecordUpdateRequest("provider_settings").BindFunc(func(e *core.RecordRequestEvent) error {
		if !e.Record.GetBool("enabled") {
			return e.Next()
		}
		if stored, err := e.App.FindRecordById("provider_settings", e.Record.Id); err == nil && stored.GetBool("enabled") {
			return e.Next()
		}
		if err := validateEnabledProvider(e.App, e.Record.GetString("type")); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("provider_config").BindFunc(func(e *core.RecordEvent) error {
		watcher.Nudge()
		devices.Nudge()
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess("provider_config").BindFunc(func(e *core.RecordEvent) error {
		watcher.Nudge()
		devices.Nudge()
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("provider_settings").BindFunc(func(e *core.RecordEvent) error {
		devices.Nudge()
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess("provider_settings").BindFunc(func(e *core.RecordEvent) error {
		devices.Nudge()
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess("provider_settings").BindFunc(func(e *core.RecordEvent) error {
		devices.Nudge()
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess("provider_config").BindFunc(func(e *core.RecordEvent) error {
		devices.Nudge()
		return e.Next()
	})

	app.OnRecordDelete("provider_config").BindFunc(func(e *core.RecordEvent) error {
		typ := e.Record.GetString("type")
		if !services.OwnsItsLibrary(typ) {
			return e.Next()
		}

		return inTransaction(e, func(txApp core.App) error {
			if err := e.Next(); err != nil {
				return err
			}

			n, err := services.DropSourceLibrary(txApp, typ)
			if err != nil {
				return err
			}
			txApp.Logger().Info("source library dropped", "source", typ, "tracks", n)
			return nil
		})
	})
}

func inTransaction(e *core.RecordEvent, body func(core.App) error) error {
	original := e.App
	err := original.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		return body(txApp)
	})
	e.App = original
	return err
}

func inRequestTransaction(e *core.RecordRequestEvent, body func(core.App) error) error {
	original := e.App
	err := original.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		return body(txApp)
	})
	e.App = original
	return err
}

func requireAnotherAdmin(app core.App, exceptID string) error {
	admins, err := app.CountRecords("users", dbx.NewExp("role = 'admin' AND id <> {:id}", dbx.Params{"id": exceptID}))
	if err != nil {
		return err
	}
	if admins == 0 {
		return apis.NewBadRequestError("The last administrator cannot be removed", nil)
	}
	return nil
}

func validateProviderConfig(app core.App, rec *core.Record) error {
	typ := rec.GetString("type")
	if err := checkSpeakerAddresses(rec); err != nil {
		return err
	}

	settings, err := app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": typ})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !settings.GetBool("enabled") {
		return nil
	}

	var config map[string]any
	_ = rec.UnmarshalJSONField("config", &config)
	return checkRequiredConfig(typ, config)
}

func checkSpeakerAddresses(rec *core.Record) error {
	var config map[string]any
	_ = rec.UnmarshalJSONField("config", &config)
	raw, ok := config[services.SpeakerField]
	if !ok {
		return nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return apis.NewBadRequestError("speakers must be a list of addresses", nil)
	}

	var speakers []services.Speaker
	if err := json.Unmarshal(encoded, &speakers); err != nil {
		return apis.NewBadRequestError("speakers must be a list of addresses", nil)
	}

	trimmed := false
	seen := make(map[string]bool, len(speakers))
	for i := range speakers {
		address := strings.TrimSpace(speakers[i].Address)
		if !services.ValidSpeakerAddress(address) {
			return apis.NewBadRequestError(fmt.Sprintf("%q is not an IPv4 address", speakers[i].Address), nil)
		}
		if seen[address] {
			return apis.NewBadRequestError(fmt.Sprintf("%q is listed twice", address), nil)
		}
		seen[address] = true
		if address != speakers[i].Address {
			speakers[i].Address = address
			trimmed = true
		}
	}

	if trimmed {
		config[services.SpeakerField] = speakers
		rec.Set("config", config)
	}

	return nil
}

func validateEnabledProvider(app core.App, typ string) error {
	var config map[string]any
	rec, err := app.FindFirstRecordByFilter("provider_config", "type = {:t}", dbx.Params{"t": typ})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if rec != nil {
		_ = rec.UnmarshalJSONField("config", &config)
	}
	return checkRequiredConfig(typ, config)
}

func checkRequiredConfig(typ string, config map[string]any) error {
	mf, ok := providers.ManifestFor(typ)
	if !ok {
		return nil
	}
	for _, field := range mf.ConfigSchema {
		if !field.Required {
			continue
		}
		if v, ok := config[field.Name].(string); !ok || strings.TrimSpace(v) == "" {
			return apis.NewBadRequestError(fmt.Sprintf("%s is required for %s", field.Label, mf.ID), nil)
		}
	}
	return nil
}
