// Package pbx holds thin helpers over the PocketBase DAO (the Go counterpart of
// the old repositories/ + lib/pocketbase.ts).
package pbx

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// EffectiveConfig resolves a provider's effective config for a user: the
// server-level provider_settings.config overlaid with the user's
// connections.config (per docs/guide/configuration.md). Server and
// user keys are disjoint by design, so a flat merge is unambiguous.
func EffectiveConfig(app core.App, userID, providerType string) providers.Config {
	cfg := providers.Config{}

	if rec, err := app.FindFirstRecordByFilter("provider_settings",
		"type = {:t}", dbx.Params{"t": providerType}); err == nil {
		merge(cfg, recordConfig(rec))
	}

	if userID != "" {
		if rec, err := app.FindFirstRecordByFilter("connections",
			"user = {:u} && type = {:t}", dbx.Params{"u": userID, "t": providerType}); err == nil {
			merge(cfg, recordConfig(rec))
		}
	}

	return cfg
}

// ProviderEnabled reports whether the provider is enabled server-wide.
func ProviderEnabled(app core.App, providerType string) bool {
	rec, err := app.FindFirstRecordByFilter("provider_settings",
		"type = {:t}", dbx.Params{"t": providerType})
	if err != nil {
		return false
	}
	return rec.GetBool("enabled")
}

func recordConfig(rec *core.Record) map[string]any {
	var m map[string]any
	if err := rec.UnmarshalJSONField("config", &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

func merge(dst providers.Config, src map[string]any) {
	for k, v := range src {
		dst[k] = v
	}
}
