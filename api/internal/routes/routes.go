package routes

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// Register mounts the custom /api routes on the PocketBase router. PocketBase
// already serves /api/health, /api/collections/*, /api/realtime, /api/files/*
// and auth out of the box — these are the melody-specific endpoints.
func Register(se *core.ServeEvent) {
	g := se.Router.Group("/api")

	g.GET("/plugins", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, providers.Manifests())
	})
}
