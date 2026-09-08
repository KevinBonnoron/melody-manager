package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

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

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
