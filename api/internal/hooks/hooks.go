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
	// The instance's first account administers it: one with no way in is worse
	// than an open one. Everyone after it is a regular user unless whoever is
	// creating the account is entitled to say otherwise, which the request hook
	// below decides, because this one cannot see who is asking.
	//
	// Counting and inserting in one transaction, because PocketBase opens its own
	// below this hook: two registrations arriving together would otherwise both
	// count nought and both come out administrators. The write connection is
	// single, so the transaction is what makes them queue.
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

	// The registration switch governs people signing themselves up. An
	// administrator adding an account is not a registration and is not subject to
	// it, and may say what the account is: without this an operator could not add
	// anyone without opening registration to the world first, and could never add
	// a second administrator at all.
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetString("role") == "admin") {
			return e.Next()
		}

		// Nobody signs themselves up as an administrator: the role is cleared here
		// and decided by the hook above, which is the only thing that grants it.
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

	// PocketBase rules are record-level, so the users updateRule lets a user
	// PATCH any field of their own record, role included, and role is the only
	// gate on the admin routes. An admin may change someone else's role; nobody
	// may change their own, which also stops a lone admin locking themselves out.
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

		// Nobody may change their own role, so demoting the last administrator
		// takes two of them doing it to each other at the same time. Counted in
		// the same transaction as the write, which is what makes that a queue of
		// one rather than a race.
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

	// Deleting the last admin would leave the instance with no way to administer
	// it, and nothing else enforces that.
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

	// An admin can list every account, but PocketBase hides other people's email
	// unless they made it visible. An admin screen without emails is useless.
	app.OnRecordEnrich("users").BindFunc(func(e *core.RecordEnrichEvent) error {
		if e.RequestInfo != nil && e.RequestInfo.Auth != nil && e.RequestInfo.Auth.GetString("role") == "admin" {
			e.Record.IgnoreEmailVisibility(true)
		}
		return e.Next()
	})

	// Refresh a user's smart playlists after a play or like (auto-creates the
	// default ones once thresholds are met). Runs async so it never blocks.
	app.OnRecordAfterCreateSuccess("track_plays", "track_ratings").BindFunc(func(e *core.RecordEvent) error {
		if uid := e.Record.GetString("user"); uid != "" {
			go services.RefreshSmartPlaylists(e.App, uid)
		}
		return e.Next()
	})

	// Bootstrap a superuser from env if none exists (headless/docker). Unlike
	// the JS hook it no-ops instead of failing when the env is unset, so
	// `task dev` works without it.
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

	// The manifest says which settings a provider cannot work without, but
	// PocketBase rules cannot express that, so nothing stopped a config being
	// saved without them, and the failure only surfaced much later, when a
	// download asked for a path that was never set.
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

	// The same requirement from the other side. validateProviderConfig only runs
	// when a configuration is written, and it lets an incomplete one through for
	// a provider that is off; nothing then stopped that provider being turned on.
	// Checked on the transition alone, so an already-enabled source with an
	// incomplete configuration can still have its other settings edited, and
	// turned off.
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

	// Pointing the server at a directory is the moment to read it, rather than
	// whenever the watcher next looks.
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

	// Which speakers may be played to is read from both rows, so both have to
	// say when they change. Without it a speaker put in service appears only at
	// the next discovery pass, ten seconds after the admin saved and went
	// looking for it.
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

	// Dropping the configuration of a source whose library *is* that
	// configuration drops the library too: the records left behind would point
	// at files the server no longer claims.
	// In one transaction with the deletion, so a library that fails to drop takes
	// the deletion down with it rather than leaving tracks pointing at a source
	// that no longer exists, with nothing left to trigger a retry.
	//
	// The transaction has to be opened here: OnRecordDelete handlers run outside
	// the one PocketBase opens further down, in OnRecordDeleteExecute, so work
	// done after e.Next() is already committed. This is the shape PocketBase
	// itself uses at that level.
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

// PocketBase opens its transaction below these hooks, in the *Execute events, so
// a check made here and the write it guards are not atomic on their own. These
// two put both inside one, which the single write connection then serialises
// against every other request.
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

// requireAnotherAdmin refuses to leave the instance with no way to administer it.
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

// validateProviderConfig rejects a provider_config record missing a value the
// manifest marks required. Only enforced when the provider is enabled: an
// operator must be able to turn a source off without filling its settings in.
// `enabled` lives on provider_settings, so it is read back by type.
func validateProviderConfig(app core.App, rec *core.Record) error {
	typ := rec.GetString("type")
	// Checked whatever the provider's state, unlike the required fields below:
	// an address nothing can be reached at is wrong the moment it is written,
	// not once the provider is switched on.
	if err := checkSpeakerAddresses(rec); err != nil {
		return err
	}

	settings, err := app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": typ})
	// A provider with no settings row is not enabled, so there is nothing to
	// enforce. Any other failure has to travel: treating it as "not enabled"
	// would let an invalid configuration through on a database error.
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

	// Trimmed as well as checked, and written back: the check ignores surrounding
	// space, so " 10.0.0.1 " was stored with it, and the address a speaker is
	// discovered at never matched the one saved. It would have sat in the list
	// answering and never usable.
	trimmed := false
	seen := make(map[string]bool, len(speakers))
	for i := range speakers {
		address := strings.TrimSpace(speakers[i].Address)
		if !services.ValidSpeakerAddress(address) {
			return apis.NewBadRequestError(fmt.Sprintf("%q is not an IPv4 address", speakers[i].Address), nil)
		}
		// One entry per speaker, or the list says two things about the same one:
		// SpeakerUsable answers with the first and the screen shows the last, so a
		// speaker could read as switched off while the server plays to it.
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

// validateEnabledProvider asks the same of the configuration already stored,
// for a provider about to be turned on.
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
