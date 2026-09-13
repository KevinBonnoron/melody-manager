package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/osutils"

	mmapp "github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/hooks"
	_ "github.com/KevinBonnoron/melody-manager/api/internal/migrations"
	"github.com/KevinBonnoron/melody-manager/api/internal/routes"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/watcher"
)

// hasFlag reports whether the flag was given on the command line, in either the
// "--flag value" or "--flag=value" form.
// isServe reports whether the command line asks for the server, which is also
// the default when no subcommand is given.
func isServe() bool {
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "-") {
			continue
		}
		return arg == "serve"
	}

	return true
}

func hasFlag(name string) bool {
	for _, arg := range os.Args[1:] {
		if arg == name || strings.HasPrefix(arg, name+"=") {
			return true
		}
	}
	return false
}

func main() {
	app := pocketbase.New()

	// Automigrate generates migration files from schema edits made in the admin
	// UI, useful while developing, wrong for the shipped single-binary image.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: os.Getenv("MELODY_AUTOMIGRATE") == "true",
	})

	deps := mmapp.New()
	// The listen address belongs with the rest of the operator settings, but
	// PocketBase takes it as a flag: supply it from the file unless the command
	// line already says otherwise, so an explicit --http still wins.
	// Only `serve` takes it: appending it to `migrate` or `superuser` makes
	// those refuse to run at all.
	if addr := deps.Config.Get().ListenAddr; addr != "" && isServe() && !hasFlag("--http") {
		os.Args = append(os.Args, "--http", addr)
	}

	hooks.Register(app, deps.Config)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Migrations have run by now, and one of them carries settings into the
		// configuration file; the copy loaded at startup predates that.
		if err := deps.Config.Reload(); err != nil {
			slog.Warn("configuration not reloaded", "path", deps.Config.Path(), "error", err)
		}

		routes.Register(se, deps)
		go watcher.Start(se.App, deps.Tasks)
		// Files can come and go while the server is down, so the library is
		// judged once at startup rather than waiting for someone to ask.
		go func() {
			result, err := services.CheckLibrary(context.Background(), se.App)
			if err != nil {
				slog.Warn("library check failed", "error", err)
				return
			}
			if result.Changed > 0 {
				slog.Info("library checked", "checked", result.Checked, "changed", result.Changed, "lost", result.Lost)
			}
		}()
		// The database only exists from here on, and a speaker's resume point is
		// written by the server rather than by an idle browser.
		deps.Devices.SetPlaybackStore(services.NewPlaybackPositions(se.App))
		deps.Devices.StartDiscovery()
		return se.Next()
	})

	// Serving pb_public is not part of the framework, only of PocketBase's own
	// example main, so the single-binary image has to wire it itself.
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(se *core.ServeEvent) error {
			if !se.Router.HasRoute(http.MethodGet, "/{path...}") {
				static := apis.Static(os.DirFS(publicDir()), true)
				se.Router.GET("/{path...}", func(e *core.RequestEvent) error {
					// An unknown endpoint must stay a JSON 404 rather than
					// fall back to the SPA shell.
					if strings.HasPrefix(e.Request.URL.Path, "/api/") {
						return e.NotFoundError("", nil)
					}
					return static(e)
				})
			}
			return se.Next()
		},
		Priority: 999,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func publicDir() string {
	if dir := os.Getenv("PUBLIC_DIR"); dir != "" {
		return dir
	}
	if osutils.IsProbablyGoRun() {
		return "./pb_public"
	}
	return filepath.Join(os.Args[0], "../pb_public")
}
