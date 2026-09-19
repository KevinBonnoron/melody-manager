package main

import (
	"context"
	"embed"
	"io/fs"
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
	"github.com/KevinBonnoron/melody-manager/api/internal/chromecast"
	"github.com/KevinBonnoron/melody-manager/api/internal/hooks"
	_ "github.com/KevinBonnoron/melody-manager/api/internal/migrations"
	"github.com/KevinBonnoron/melody-manager/api/internal/players"
	"github.com/KevinBonnoron/melody-manager/api/internal/routes"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/sonos"
	"github.com/KevinBonnoron/melody-manager/api/internal/watcher"
)

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

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: os.Getenv("MELODY_AUTOMIGRATE") == "true",
	})

	deps := mmapp.New()
	if addr := deps.Config.Get().ListenAddr; addr != "" && isServe() && !hasFlag("--http") {
		os.Args = append(os.Args, "--http", addr)
	}

	hooks.Register(app, deps.Config)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := deps.Config.Reload(); err != nil {
			slog.Warn("configuration not reloaded", "path", deps.Config.Path(), "error", err)
		}

		routes.Register(se, deps)
		go watcher.Start(se.App, deps.Tasks)
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
		deps.Devices.SetPlaybackStore(deps.Player)
		deps.Devices.SetSpeakerStore(services.NewSpeakerAddresses(se.App))
		deps.Devices.SetPlayers(players.Registry{
			sonos.Kind:      sonos.NewPlayer(),
			chromecast.Kind: chromecast.NewPlayer(),
		})
		deps.Devices.StartDiscovery()
		return se.Next()
	})

	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(se *core.ServeEvent) error {
			if !se.Router.HasRoute(http.MethodGet, "/{path...}") {
				static := apis.Static(clientFS(), true)
				se.Router.GET("/{path...}", func(e *core.RequestEvent) error {
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

//go:embed all:client
var embeddedClient embed.FS

// useEmbeddedClient decides where the client is read from.
//
// The compiled-in copy is what makes the binary the whole application, but it
// loses to anything more specific: a directory named outright, and go run,
// where a bundle compiled in by an earlier build would be served long after it
// stopped matching the source.
func useEmbeddedClient(publicDirNamed, goRun, compiledIn bool) bool {
	return compiledIn && !publicDirNamed && !goRun
}

// clientFS is the built client the server hands to a browser.
func clientFS() fs.FS {
	bundle, err := fs.Sub(embeddedClient, "client/dist")
	compiledIn := false
	if err == nil {
		_, err = fs.Stat(bundle, "index.html")
		compiledIn = err == nil
	}

	if useEmbeddedClient(os.Getenv("PUBLIC_DIR") != "", osutils.IsProbablyGoRun(), compiledIn) {
		return bundle
	}
	return os.DirFS(publicDir())
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
