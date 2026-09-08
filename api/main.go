package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	mmapp "github.com/KevinBonnoron/melody-manager/api/internal/app"
	_ "github.com/KevinBonnoron/melody-manager/api/internal/migrations"
	"github.com/KevinBonnoron/melody-manager/api/internal/routes"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	deps := mmapp.New()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		routes.Register(se, deps)
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
