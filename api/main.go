package main

import (
	"log"
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
	"github.com/KevinBonnoron/melody-manager/api/internal/watcher"
)

func main() {
	app := pocketbase.New()

	// Automigrate generates migration files from schema edits made in the admin
	// UI — useful while developing, wrong for the shipped single-binary image.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: os.Getenv("MELODY_AUTOMIGRATE") == "true",
	})

	deps := mmapp.New()
	hooks.Register(app)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		routes.Register(se, deps)
		go watcher.Start(se.App)
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
