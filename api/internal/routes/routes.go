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
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/sonos"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

// Register mounts the melody-specific endpoints. PocketBase already serves
// /api/health, /api/collections/* (used by the client to read library data),
// /api/realtime, /api/files/* and auth.
func Register(se *core.ServeEvent, deps *app.Deps) {
	// Endpoints that cannot carry an Authorization header: <audio> elements set
	// the URL directly and Sonos speakers fetch it themselves. They authenticate
	// with a short-lived token in the query string instead (streamUserID), and
	// share links are meant to be opened by anonymous recipients.
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
		// The waveform is decoration: a source we cannot decode must not turn into
		// a failed request, it just means no waveform.
		peaks, err := services.TrackPeaks(e.Request.Context(), e.App, deps.Registry, deps.Cache, e.Request.PathValue("id"), uid)
		if err != nil {
			e.App.Logger().Warn("peaks unavailable", "track", e.Request.PathValue("id"), "error", err)
			peaks = []float64{}
		}
		return e.JSON(http.StatusOK, map[string]any{"peaks": peaks})
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

	// Mints the token the player and Sonos append to stream URLs.
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

	// --- Devices (Sonos) ---
	g.GET("/devices", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"success": true, "data": deps.Devices.List()})
	})
	// POST rather than GET: the SSE client falls back to EventSource for GET,
	// which cannot carry an Authorization header, and uses fetch otherwise.
	g.POST("/devices/events", func(e *core.RequestEvent) error { return streamDevices(e, deps) })
	g.POST("/devices/{id}/play/{trackId}", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	g.POST("/devices/{id}/play", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	g.POST("/devices/{id}/pause", deviceAction(deps, sonos.Pause))
	g.POST("/devices/{id}/stop", deviceAction(deps, sonos.Stop))
	g.POST("/devices/{id}/next", deviceAction(deps, sonos.Next))
	g.POST("/devices/{id}/previous", deviceAction(deps, sonos.Previous))
	g.POST("/devices/{id}/seek", func(e *core.RequestEvent) error {
		dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		var body struct {
			Position int `json:"position"`
		}
		_ = e.BindBody(&body)
		if err := sonos.Seek(e.Request.Context(), dev.IPAddress, body.Position); err != nil {
			return e.InternalServerError("seek failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})
	g.POST("/devices/{id}/volume", func(e *core.RequestEvent) error {
		dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		var body struct {
			Volume int `json:"volume"`
		}
		_ = e.BindBody(&body)
		if err := sonos.SetVolume(e.Request.Context(), dev.IPAddress, body.Volume); err != nil {
			return e.InternalServerError("volume failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})
	g.GET("/devices/{id}/state", func(e *core.RequestEvent) error {
		dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		ctx := e.Request.Context()
		return e.JSON(http.StatusOK, map[string]any{"success": true, "data": map[string]any{
			"state": sonos.GetState(ctx, dev.IPAddress), "track": nil, "volume": sonos.GetVolume(ctx, dev.IPAddress),
		}})
	})
	g.POST("/devices/{id}/queue/{trackId}", func(e *core.RequestEvent) error {
		dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		tok, err := streamToken(e.Auth)
		if err != nil {
			return e.InternalServerError("stream token", err)
		}
		if err := sonos.AddToQueue(e.Request.Context(), dev.IPAddress, deps.Devices.StreamURL(e.Request.PathValue("trackId"), tok)); err != nil {
			return e.InternalServerError("queue failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})
	g.DELETE("/devices/{id}/queue", deviceAction(deps, sonos.ClearQueue))

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
		task := deps.Tasks.Create("scan", "")
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
				t.Count = n
			})
		}()
		return e.JSON(http.StatusAccepted, task)
	})

	g.POST("/albums/{id}/download", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		id := e.Request.PathValue("id")
		task := deps.Tasks.Create("download", albumName(e.App, id))
		go services.DownloadAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
		return e.JSON(http.StatusAccepted, task)
	})

	g.POST("/albums/{id}/resync", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		id := e.Request.PathValue("id")
		task := deps.Tasks.Create("resync", albumName(e.App, id))
		go services.ResyncAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
		return e.JSON(http.StatusAccepted, map[string]any{"taskId": task.ID})
	})

	g.POST("/metadata/enrich", func(e *core.RequestEvent) error {
		if e.Auth == nil || e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		task := deps.Tasks.Create("enrichment", "")
		go services.EnrichAll(context.Background(), e.App, deps.Tasks, task.ID)
		return e.JSON(http.StatusAccepted, map[string]any{"taskId": task.ID})
	})

	g.DELETE("/playlists/{id}", func(e *core.RequestEvent) error {
		rec, errResp := ownedPlaylist(e)
		if errResp != nil {
			return errResp
		}
		if err := e.App.Delete(rec); err != nil {
			return e.InternalServerError("delete failed", err)
		}
		return e.NoContent(http.StatusNoContent)
	})

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

	g.POST("/tasks/events", func(e *core.RequestEvent) error {
		return streamTasks(e, deps)
	})
	g.GET("/tasks", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"tasks": deps.Tasks.List()})
	})
	g.DELETE("/tasks/completed", func(e *core.RequestEvent) error {
		deps.Tasks.ClearCompleted()
		return e.NoContent(http.StatusNoContent)
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
				t.Count = len(imported)
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
	// Flush the headers straight away: without any data the client would sit in
	// CONNECTING until the first event, which may never come.
	if flusher != nil {
		flusher.Flush()
	}

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

// streamTokenTTL bounds how long a leaked stream URL stays usable. Long enough
// to outlive a queue, short enough that a copied URL is not a permanent grant.
const streamTokenTTL = 6 * time.Hour

func streamToken(auth *core.Record) (string, error) {
	return auth.NewStaticAuthToken(streamTokenTTL)
}

// streamUserID authenticates a stream request either from the Authorization
// header or from the ?token= minted by GET /api/stream-token.
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

// albumName labels a task with its subject rather than a sentence.
func albumName(app core.App, id string) string {
	if rec, err := app.FindRecordById("albums", id); err == nil {
		return rec.GetString("name")
	}
	return ""
}

func userID(e *core.RequestEvent) string {
	if e.Auth != nil {
		return e.Auth.Id
	}
	return ""
}

func playOnDevice(e *core.RequestEvent, deps *app.Deps) error {
	dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
	if !ok {
		return e.NotFoundError("device not found", nil)
	}
	ctx := e.Request.Context()
	trackID := e.Request.PathValue("trackId")
	if trackID == "" {
		if err := sonos.Play(ctx, dev.IPAddress); err != nil {
			return e.InternalServerError("play failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	}
	track, err := e.App.FindRecordById("tracks", trackID)
	if err != nil {
		return e.NotFoundError("track not found", err)
	}
	artist, album := "", ""
	if ids := track.GetStringSlice("artists"); len(ids) > 0 {
		if a, err := e.App.FindRecordById("artists", ids[0]); err == nil {
			artist = a.GetString("name")
		}
	}
	if al, err := e.App.FindRecordById("albums", track.GetString("album")); err == nil {
		album = al.GetString("name")
	}
	tok, err := streamToken(e.Auth)
	if err != nil {
		return e.InternalServerError("stream token", err)
	}
	if err := sonos.PlayURL(ctx, dev.IPAddress, deps.Devices.StreamURL(trackID, tok), "audio/mpeg", track.GetString("title"), artist, album, track.GetInt("duration")); err != nil {
		return e.InternalServerError("play failed", err)
	}
	return e.JSON(http.StatusOK, map[string]any{"success": true})
}

func deviceAction(deps *app.Deps, fn func(context.Context, string) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		if err := fn(e.Request.Context(), dev.IPAddress); err != nil {
			return e.InternalServerError("device action failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	}
}

func streamDevices(e *core.RequestEvent, deps *app.Deps) error {
	w := e.Response
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	// Flush the headers straight away: without any data the client would sit in
	// CONNECTING until the first event, which may never come.
	if flusher != nil {
		flusher.Flush()
	}
	write := func(list []devices.Device) {
		b, _ := json.Marshal(list)
		fmt.Fprintf(w, "event: devices\ndata: %s\n\n", b)
		if flusher != nil {
			flusher.Flush()
		}
	}
	write(deps.Devices.List())

	ch, unsub := deps.Devices.Subscribe()
	defer unsub()
	ctx := e.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case list, ok := <-ch:
			if !ok {
				return nil
			}
			write(list)
		}
	}
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
