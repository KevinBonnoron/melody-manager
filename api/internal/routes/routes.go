package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

// Register mounts the melody-specific endpoints. PocketBase already serves
// /api/health, /api/collections/* (used by the client to read library data),
// /api/realtime, /api/files/* and auth.
func Register(se *core.ServeEvent, deps *app.Deps) {
	// Endpoints that cannot carry an Authorization header: the player assigns
	// the stream URL to an <audio> element and a Sonos speaker fetches it
	// itself. They authenticate with the short-lived token minted by
	// GET /api/stream-token. Share links are opened by anonymous recipients.
	se.Router.GET("/api/tracks/stream/{id}", func(e *core.RequestEvent) error {
		uid, errResp := streamUserID(e)
		if errResp != nil {
			return errResp
		}
		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, e.Request.PathValue("id"), e.Request.URL.Query().Get("transcode"), uid)
	})
	se.Router.GET("/api/tracks/peaks/{id}", func(e *core.RequestEvent) error {
		uid, errResp := streamUserID(e)
		if errResp != nil {
			return errResp
		}
		peaks, err := services.TrackPeaks(e.Request.Context(), e.App, deps.Registry, deps.Cache, e.Request.PathValue("id"), uid)
		if err != nil {
			return e.InternalServerError("peaks", err)
		}
		return e.JSON(http.StatusOK, peaks)
	})
	se.Router.GET("/api/share/stream/{token}", func(e *core.RequestEvent) error {
		link, err := e.App.FindFirstRecordByFilter("share_links", "token = {:t}", dbx.Params{"t": e.Request.PathValue("token")})
		if err != nil {
			return e.NotFoundError("invalid share link", err)
		}
		if expiry := link.GetDateTime("expiresAt"); !expiry.IsZero() && expiry.Time().Before(time.Now()) {
			return e.NotFoundError("share link expired", nil)
		}
		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, link.GetString("track"), e.Request.URL.Query().Get("transcode"), "")
	})

	g := se.Router.Group("/api")
	g.Bind(apis.RequireAuth())

	g.GET("/stream-token", func(e *core.RequestEvent) error {
		token, err := streamToken(e.Auth)
		if err != nil {
			return e.InternalServerError("stream token", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"token": token, "expiresIn": int(streamTokenTTL.Seconds())})
	})

	g.GET("/plugins", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, providers.Manifests())
	})

	g.POST("/search", func(e *core.RequestEvent) error {
		var body struct {
			Query  string `json:"query"`
			Type   string `json:"type"`
			Source string `json:"source"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		if body.Source == "library" {
			return e.JSON(http.StatusOK, toSearchResponse(services.SearchLibrary(e.App, body.Query), nil))
		}
		typ := domain.SearchResultType(body.Type)
		if typ == "" {
			typ = domain.ResultTrack
		}
		// The request context, so an aborted search stops the yt-dlp processes
		// it spawned instead of running them to completion.
		results, provErrs := services.SearchProviders(e.Request.Context(), e.App, deps.Registry, body.Query, typ, userID(e))
		return e.JSON(http.StatusOK, toSearchResponse(results, provErrs))
	})

	for _, kind := range []services.ImportKind{services.KindAlbum, services.KindArtist, services.KindTrack, services.KindPlaylist} {
		g.POST("/"+string(kind)+"/add", importHandler(deps, kind))
	}

	g.POST("/local/scan", func(e *core.RequestEvent) error {
		if e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		task := deps.Tasks.Create("scan", "Local library scan")
		go func() {
			deps.Tasks.Update(task.ID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 10 })
			n, err := services.ScanLocal(context.Background(), e.App)
			deps.Tasks.Update(task.ID, func(t *tasks.Task) {
				if err != nil {
					t.Status = tasks.Failed
					t.Error = err.Error()
					return
				}
				t.Status = tasks.Completed
				t.Progress = 100
				t.Name = fmt.Sprintf("Local scan: %d tracks added", n)
			})
		}()
		return e.JSON(http.StatusAccepted, task)
	})

	g.POST("/albums/{id}/download", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		task := deps.Tasks.Create("download", "Download album")
		id := e.Request.PathValue("id")
		go services.DownloadAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
		return e.JSON(http.StatusAccepted, task)
	})

	g.POST("/albums/{id}/resync", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		task := deps.Tasks.Create("resync", "Resync album")
		id := e.Request.PathValue("id")
		go services.ResyncAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
		return e.JSON(http.StatusAccepted, map[string]any{"taskId": task.ID})
	})

	g.POST("/metadata/enrich", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		task := deps.Tasks.Create("enrichment", "Enriching metadata")
		go services.EnrichAll(context.Background(), e.App, deps.Tasks, task.ID)
		return e.JSON(http.StatusAccepted, map[string]any{"taskId": task.ID})
	})

	g.DELETE("/tracks/{id}", deleteHandler("tracks", true))
	g.DELETE("/albums/{id}", deleteHandler("albums", true))
	g.DELETE("/artists/{id}", deleteHandler("artists", true))
	g.DELETE("/playlists/{id}", deleteHandler("playlists", false))

	g.GET("/stats/overview", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, services.Overview(e.App, userID(e)))
	})
	g.GET("/stats/play-counts", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, services.PlayCounts(e.App, userID(e)))
	})

	g.GET("/playlists", func(e *core.RequestEvent) error {
		uid := userID(e)
		if uid == "" {
			return e.UnauthorizedError("authentication required", nil)
		}
		likes, err := e.App.FindRecordsByFilter("playlist_likes", "user = {:u}", "", 0, 0, dbx.Params{"u": uid})
		if err != nil {
			return e.InternalServerError("playlists", err)
		}
		ids := make([]string, 0, len(likes))
		for _, l := range likes {
			ids = append(ids, l.GetString("playlist"))
		}
		out := make([]*core.Record, 0, len(ids))
		for _, id := range ids {
			if r, err := e.App.FindRecordById("playlists", id); err == nil {
				out = append(out, r)
			}
		}
		return e.JSON(http.StatusOK, out)
	})
	g.GET("/playlists/{id}", func(e *core.RequestEvent) error {
		r, err := e.App.FindRecordById("playlists", e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("playlist not found", err)
		}
		return e.JSON(http.StatusOK, r)
	})

	g.PUT("/playlists/{id}", func(e *core.RequestEvent) error {
		rec, errResp := ownedPlaylist(e)
		if errResp != nil {
			return errResp
		}
		var body struct {
			Name        *string   `json:"name"`
			Description *string   `json:"description"`
			Tracks      *[]string `json:"tracks"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		if body.Name != nil {
			rec.Set("name", *body.Name)
		}
		if body.Description != nil {
			rec.Set("description", *body.Description)
		}
		if body.Tracks != nil {
			rec.Set("tracks", *body.Tracks)
		}
		if err := e.App.Save(rec); err != nil {
			return e.InternalServerError("update failed", err)
		}
		return e.JSON(http.StatusOK, rec)
	})

	g.POST("/playlists/{id}/tracks", func(e *core.RequestEvent) error {
		rec, errResp := ownedPlaylist(e)
		if errResp != nil {
			return errResp
		}
		var body struct {
			TrackIDs []string `json:"trackIds"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		rec.Set("tracks", union(rec.GetStringSlice("tracks"), body.TrackIDs))
		if err := e.App.Save(rec); err != nil {
			return e.InternalServerError("add tracks failed", err)
		}
		return e.JSON(http.StatusOK, rec)
	})

	g.DELETE("/playlists/{id}/tracks/{trackId}", func(e *core.RequestEvent) error {
		rec, errResp := ownedPlaylist(e)
		if errResp != nil {
			return errResp
		}
		trackID := e.Request.PathValue("trackId")
		kept := make([]string, 0)
		for _, t := range rec.GetStringSlice("tracks") {
			if t != trackID {
				kept = append(kept, t)
			}
		}
		rec.Set("tracks", kept)
		if err := e.App.Save(rec); err != nil {
			return e.InternalServerError("remove track failed", err)
		}
		return e.JSON(http.StatusOK, rec)
	})

	g.GET("/tasks", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"tasks": deps.Tasks.List()})
	})
	g.DELETE("/tasks/completed", func(e *core.RequestEvent) error {
		deps.Tasks.ClearCompleted()
		return e.NoContent(http.StatusNoContent)
	})
	g.GET("/tasks/events", func(e *core.RequestEvent) error {
		return streamTasks(e, deps)
	})

}

func importHandler(deps *app.Deps, kind services.ImportKind) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			URL string `json:"url"`
		}
		if err := e.BindBody(&body); err != nil || body.URL == "" {
			return e.BadRequestError("missing url", err)
		}
		uid := userID(e)
		task := deps.Tasks.Create("import", body.URL)
		go func() {
			deps.Tasks.Update(task.ID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 10 })
			imported, err := services.Import(context.Background(), e.App, deps.Registry, body.URL, kind, uid)
			deps.Tasks.Update(task.ID, func(t *tasks.Task) {
				if err != nil {
					t.Status = tasks.Failed
					t.Error = err.Error()
					return
				}
				t.Status = tasks.Completed
				t.Progress = 100
				t.Name = fmt.Sprintf("Imported %d tracks", len(imported))
			})
		}()
		return e.JSON(http.StatusAccepted, task)
	}
}

func streamTasks(e *core.RequestEvent, deps *app.Deps) error {
	w := e.Response
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)

	writeEvent := func(t tasks.Task) {
		b, _ := json.Marshal(t)
		fmt.Fprintf(w, "event: task\ndata: %s\n\n", b)
		if flusher != nil {
			flusher.Flush()
		}
	}
	for _, t := range deps.Tasks.List() {
		writeEvent(t)
	}

	ch, unsub := deps.Tasks.Subscribe()
	defer unsub()
	ctx := e.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case t, ok := <-ch:
			if !ok {
				return nil
			}
			writeEvent(t)
		}
	}
}

// streamTokenTTL bounds how long a leaked stream URL stays usable: long enough
// to outlive a queue, short enough that a copied URL is not a standing grant.
const streamTokenTTL = 6 * time.Hour

func streamToken(auth *core.Record) (string, error) {
	return auth.NewStaticAuthToken(streamTokenTTL)
}

// streamUserID authenticates a stream request from the Authorization header or
// from the ?token= minted by GET /api/stream-token.
func streamUserID(e *core.RequestEvent) (string, error) {
	if e.Auth != nil {
		return e.Auth.Id, nil
	}
	raw := e.Request.URL.Query().Get("token")
	if raw == "" {
		return "", e.UnauthorizedError("authentication required", nil)
	}
	rec, err := e.App.FindAuthRecordByToken(raw, core.TokenTypeAuth)
	if err != nil {
		return "", e.UnauthorizedError("invalid stream token", err)
	}
	return rec.Id, nil
}

func userID(e *core.RequestEvent) string {
	if e.Auth != nil {
		return e.Auth.Id
	}
	return ""
}

// ownedPlaylist loads the playlist if the current user owns it (likes it),
// otherwise returns the appropriate error response.
func ownedPlaylist(e *core.RequestEvent) (*core.Record, error) {
	uid := userID(e)
	if uid == "" {
		return nil, e.UnauthorizedError("authentication required", nil)
	}
	id := e.Request.PathValue("id")
	if _, err := e.App.FindFirstRecordByFilter("playlist_likes", "user = {:u} && playlist = {:p}", dbx.Params{"u": uid, "p": id}); err != nil {
		return nil, e.ForbiddenError("not your playlist", nil)
	}
	rec, err := e.App.FindRecordById("playlists", id)
	if err != nil {
		return nil, e.NotFoundError("playlist not found", err)
	}
	return rec, nil
}

func union(a, b []string) []string {
	seen := make(map[string]bool, len(a))
	out := make([]string, 0, len(a)+len(b))
	for _, v := range append(append([]string{}, a...), b...) {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// toSearchResponse maps internal results to the client's SearchResponse shape
// ({ results, providerErrors }) with the field names the TS types expect.
func toSearchResponse(results []domain.SearchResult, provErrs []services.ProviderError) map[string]any {
	mapped := make([]map[string]any, 0, len(results))
	for _, r := range results {
		m := map[string]any{
			"type":          string(r.Type),
			"provider":      r.Source,
			"sourceUrl":     r.SourceURL,
			"coverUrl":      r.CoverURL,
			"libraryStatus": map[string]any{"isInLibrary": r.InLibrary},
		}
		if r.Type == domain.ResultTrack {
			m["title"] = r.Title
			m["artist"] = r.Subtitle
			m["duration"] = r.Duration
		} else {
			m["name"] = r.Title
		}
		mapped = append(mapped, m)
	}
	if provErrs == nil {
		provErrs = []services.ProviderError{}
	}
	return map[string]any{"results": mapped, "providerErrors": provErrs}
}

func deleteHandler(collection string, adminOnly bool) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("authentication required", nil)
		}
		if adminOnly && e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		rec, err := e.App.FindRecordById(collection, e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("not found", err)
		}
		if err := e.App.Delete(rec); err != nil {
			return e.InternalServerError("delete failed", err)
		}
		return e.NoContent(http.StatusNoContent)
	}
}
