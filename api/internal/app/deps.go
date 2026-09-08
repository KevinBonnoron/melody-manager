// Package app wires shared runtime dependencies for the custom routes.
package app

import (
	"log/slog"
	"os"
	"path/filepath"

	"github.com/KevinBonnoron/melody-manager/api/internal/cache"
	"github.com/KevinBonnoron/melody-manager/api/internal/config"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

// Deps holds the long-lived services shared across requests.
type Deps struct {
	Registry *providers.Registry
	Tasks    *tasks.Service
	Devices  *devices.Service
	Cache    *cache.Cache
}

// New builds the default dependency set.
func New() *Deps {
	cfg := config.Load()
	audio, err := cache.New(cfg.CacheDir, cfg.CacheMaxFile, cfg.CacheMaxSize)
	if err != nil {
		// A configured directory that cannot be created is worth reporting, but
		// not worth refusing to start over: fall back to the system temp dir.
		slog.Warn("audio cache unavailable, falling back to the temp dir", "dir", cfg.CacheDir, "error", err)
		audio, err = cache.New(filepath.Join(os.TempDir(), "melody-manager-cache"), cfg.CacheMaxFile, cfg.CacheMaxSize)
		if err != nil {
			slog.Error("audio cache disabled", "error", err)
		}
	}
	return &Deps{
		Registry: providers.NewRegistry(),
		Tasks:    tasks.New(),
		Devices:  devices.New(cfg.ServerURL),
		Cache:    audio,
	}
}
