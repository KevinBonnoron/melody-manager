package routes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/config"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/netaddr"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/players"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/sonos"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
	"github.com/KevinBonnoron/melody-manager/api/internal/version"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

func appShellCORS() *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		Priority: apis.DefaultCorsMiddlewarePriority - 1,
		Func: func(e *core.RequestEvent) error {
			origin := e.Request.Header.Get("Origin")
			if !isAppShellOrigin(origin) {
				return e.Next()
			}

			header := e.Response.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Add("Vary", "Origin")
			if e.Request.Method != http.MethodOptions {
				e.Request.Header.Del("Origin")
				return e.Next()
			}

			header.Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
			if requested := e.Request.Header.Get("Access-Control-Request-Headers"); requested != "" {
				header.Set("Access-Control-Allow-Headers", requested)
			}
			return e.NoContent(http.StatusNoContent)
		},
	}
}

func isAppShellOrigin(origin string) bool {
	scheme, _, found := strings.Cut(origin, "://")
	return found && scheme != "http" && scheme != "https"
}

func Register(se *core.ServeEvent, deps *app.Deps) {
	se.Router.Bind(appShellCORS())

	se.Router.GET("/api/tracks/{id}/stream", func(e *core.RequestEvent) error {
		trackID := e.Request.PathValue("id")
		uid, errResp := streamUserID(e, trackID)
		if errResp != nil {
			return errResp
		}
		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, trackID, e.Request.URL.Query().Get("transcode"), uid)
	})
	se.Router.GET("/api/albums/{id}/cover", func(e *core.RequestEvent) error {
		album, err := e.App.FindRecordById("albums", e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("album not found", err)
		}

		name := album.GetString("cover")
		if name == "" {
			return e.NotFoundError("this album has no cover", nil)
		}

		fsys, err := e.App.NewFilesystem()
		if err != nil {
			return e.InternalServerError("storage", err)
		}
		defer fsys.Close()

		base := album.BaseFilesPath()
		thumb := fmt.Sprintf("%s/thumbs_%s/%s_%s", base, name, coverThumbSize, name)
		if err := fsys.Serve(e.Response, e.Request, thumb, name); err == nil {
			return nil
		}
		return fsys.Serve(e.Response, e.Request, base+"/"+name, name)
	})

	se.Router.GET("/api/tracks/{id}/peaks", func(e *core.RequestEvent) error {
		uid, errResp := streamUserID(e, e.Request.PathValue("id"))
		if errResp != nil {
			return errResp
		}
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
			return shareGone(e, "revoked")
		}
		if expiry := link.GetDateTime("expiresAt"); !expiry.IsZero() && expiry.Time().Before(time.Now()) {
			return shareGone(e, "expired")
		}

		if e.Request.Header.Get("Range") == "" {
			link.Set("plays", link.GetInt("plays")+1)
			if err := e.App.Save(link); err != nil {
				e.App.Logger().Warn("share play not counted", "token", link.GetString("token"), "error", err)
			}
		}

		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, link.GetString("track"), e.Request.URL.Query().Get("transcode"), "")
	})

	// Which build is running. PocketBase owns /api/health and answers it with
	// its own shape, so this is beside it rather than inside it, and it is
	// asked without a token: confirming what a deployment landed is worth more
	// than keeping the revision to ourselves.
	se.Router.GET("/api/version", func(e *core.RequestEvent) error {
		revision, builtAt := version.Build()
		return e.JSON(http.StatusOK, map[string]string{"revision": revision, "builtAt": builtAt})
	})

	se.Router.GET("/api/config", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.JSON(http.StatusOK, map[string]any{"registrationAllowed": deps.Config.Get().RegistrationAllowed})
		}

		return e.JSON(http.StatusOK, struct {
			config.Config
			Path string `json:"path"`
		}{deps.Config.Get(), deps.Config.Path()})
	})

	g := se.Router.Group("/api")
	g.Bind(apis.RequireAuth())

	registerPlayer(se, g, deps)

	g.GET("/stream-token", func(e *core.RequestEvent) error {
		trackID := e.Request.URL.Query().Get("track")
		if trackID == "" {
			return e.BadRequestError("missing track", nil)
		}
		token, err := mintStreamToken(e.App, e.Auth.Id, trackID)
		if err != nil {
			return e.InternalServerError("stream token", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"token": token, "expiresIn": int(streamTokenTTL.Seconds())})
	})

	g.GET("/plugins", func(e *core.RequestEvent) error {
		manifests := providers.Manifests()
		out := make([]providers.Manifest, 0, len(manifests))
		for _, mf := range manifests {
			mf.Unavailable = pbx.MissingConfig(e.App, mf.ID)
			out = append(out, mf)
		}
		return e.JSON(http.StatusOK, out)
	})

	g.GET("/config/address-candidates", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}

		scheme := "http"
		if e.Request.TLS != nil {
			scheme = "https"
		}

		port := ""
		if _, p, err := net.SplitHostPort(e.Request.Host); err == nil {
			port = p
		}

		candidates := []string{}
		for _, host := range netaddr.Candidates() {
			if port != "" {
				host = net.JoinHostPort(host, port)
			}
			candidates = append(candidates, scheme+"://"+host)
		}
		return e.JSON(http.StatusOK, map[string]any{"candidates": candidates})
	})
	g.PATCH("/config", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}

		next := deps.Config.Get()
		if err := e.BindBody(&next); err != nil {
			return e.BadRequestError("invalid configuration", err)
		}
		if err := deps.Config.Save(next); err != nil {
			return e.InternalServerError("configuration not saved", err)
		}
		return e.JSON(http.StatusOK, next)
	})

	g.GET("/devices", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"success": true, "data": deps.Devices.List(userID(e))})
	})
	g.POST("/devices/{id}/play/{trackId}", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	g.POST("/devices/{id}/play", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	g.POST("/devices/{id}/pause", deviceAction(deps, "pause", players.Player.Pause))
	g.POST("/devices/{id}/stop", deviceAction(deps, "stop", players.Player.Stop))
	g.POST("/devices/{id}/next", deviceAction(deps, "next", players.Player.Next))
	g.POST("/devices/{id}/previous", deviceAction(deps, "previous", players.Player.Previous))
	g.POST("/devices/{id}/seek", func(e *core.RequestEvent) error {
		dev, ok := usableDevice(deps, e)
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		var body struct {
			Position float64 `json:"position"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		position := rounded(body.Position)
		if clientDevice(deps, dev) {
			if !deps.Devices.SendCommand(dev.ID, fmt.Sprintf("seek:%d", position)) {
				return e.NotFoundError("device not found", nil)
			}
			return e.JSON(http.StatusOK, map[string]any{"success": true})
		}
		player, speaks := deps.Devices.PlayerFor(dev)
		if !speaks {
			return e.NotFoundError("device not found", nil)
		}
		if err := player.Seek(e.Request.Context(), dev.IPAddress, position); err != nil {
			return speakerError(e, err)
		}
		deps.Devices.WatchSpeaker(dev.ID)
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})
	g.POST("/devices/{id}/volume", func(e *core.RequestEvent) error {
		dev, ok := usableDevice(deps, e)
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		var body struct {
			Volume float64 `json:"volume"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		volume := rounded(body.Volume)
		if clientDevice(deps, dev) {
			if !deps.Devices.SendCommand(dev.ID, fmt.Sprintf("volume:%d", volume)) {
				return e.NotFoundError("device not found", nil)
			}
			deps.Devices.SetClientVolume(dev.ID, volume)
			return e.JSON(http.StatusOK, map[string]any{"success": true})
		}
		player, speaks := deps.Devices.PlayerFor(dev)
		if !speaks {
			return e.NotFoundError("device not found", nil)
		}
		if err := player.SetVolume(e.Request.Context(), dev.IPAddress, volume); err != nil {
			return speakerError(e, err)
		}
		deps.Devices.WatchSpeaker(dev.ID)
		return e.JSON(http.StatusOK, map[string]any{"success": true})
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
		results, provErrs := services.SearchProviders(e.Request.Context(), e.App, deps.Registry, body.Query, typ, userID(e))
		return e.JSON(http.StatusOK, toSearchResponse(results, provErrs))
	})

	for _, kind := range []services.ImportKind{services.KindAlbum, services.KindArtist, services.KindTrack, services.KindPlaylist} {
		g.POST("/"+string(kind)+"/add", importHandler(deps, kind))
	}

	g.POST("/tracks/preview", func(e *core.RequestEvent) error {
		var body struct {
			URL string `json:"url"`
		}
		if err := e.BindBody(&body); err != nil || body.URL == "" {
			return e.BadRequestError("missing url", err)
		}

		ctx, cancel := context.WithTimeout(e.Request.Context(), previewTimeout)
		defer cancel()
		tracks, err := services.PreviewTracks(ctx, e.App, deps.Registry, body.URL, userID(e))
		if err != nil {
			if errors.Is(err, services.ErrNoProvider) {
				return e.BadRequestError("unsupportedUrl", err)
			}
			// Why a video could not be read decides what the caller does about it, so it
			// travels, but as a word this server chose: yt-dlp's own line is whatever
			// YouTube wrote, and it goes to the log where a name for it is worked out.
			if reason := ytdlp.Reason(err); reason != "" {
				cause := ytdlp.Cause(err)
				if cause == "" {
					// The only thing that says a wording has moved on. Grep for it.
					e.App.Logger().Warn("preview failed for a reason with no name", "url", body.URL, "reason", reason)
					return e.InternalServerError("preview failed", err)
				}

				e.App.Logger().Warn("preview failed", "url", body.URL, "cause", cause, "reason", reason)
				// A link this server cannot read is the caller's to fix, wherever the
				// refusal came from: the registry above, or yt-dlp looking at it.
				if cause == "unsupportedUrl" {
					return e.BadRequestError(cause, err)
				}
				return e.InternalServerError(cause, err)
			}
			return e.InternalServerError("preview failed", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"tracks": tracks})
	})

	g.POST("/local/scan", func(e *core.RequestEvent) error {
		if e.Auth.GetString("role") != "admin" {
			return e.ForbiddenError("admin only", nil)
		}
		return e.JSON(http.StatusAccepted, services.ScanLocalTask(context.Background(), e.App, deps.Tasks))
	})

	g.POST("/library/check", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}

		task := deps.Tasks.Create("check", "")
		go func() {
			deps.Tasks.Update(task.ID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 10 })
			result, err := services.CheckLibrary(context.Background(), e.App)
			deps.Tasks.Update(task.ID, func(t *tasks.Task) {
				if err != nil {
					t.Status = tasks.Failed
					t.Error = err.Error()
					return
				}
				t.Status = tasks.Completed
				t.Progress = 100
				t.Count = result.Lost
			})
		}()
		return e.JSON(http.StatusAccepted, task)
	})

	g.PATCH("/users/{id}/credentials", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}

		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}

		user, err := e.App.FindRecordById("users", e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("user not found", err)
		}

		if body.Email != "" && body.Email != user.Email() {
			user.SetEmail(body.Email)
		}
		if body.Password != "" {
			if len(body.Password) < passwordMinLength {
				return e.BadRequestError(fmt.Sprintf("the password must be at least %d characters", passwordMinLength), nil)
			}
			user.SetPassword(body.Password)
		}

		if err := e.App.Save(user); err != nil {
			return e.BadRequestError(err.Error(), err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})

	g.POST("/albums/{id}/download", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		id := e.Request.PathValue("id")
		task := deps.Tasks.Create("download", albumName(e.App, id))
		go services.DownloadAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
		return e.JSON(http.StatusAccepted, task)
	})

	g.PATCH("/albums/{id}", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		var body struct {
			Name   string `json:"name"`
			Artist string `json:"artist"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}

		id := e.Request.PathValue("id")
		if body.Artist != "" {
			if err := services.ReattachAlbum(e.App, id, body.Artist); err != nil {
				return renameError(e, err)
			}
		}
		if body.Name != "" {
			if err := services.RenameAlbum(e.App, id, body.Name); err != nil {
				return renameError(e, err)
			}
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})

	g.PATCH("/artists/{id}", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := e.BindBody(&body); err != nil || body.Name == "" {
			return e.BadRequestError("missing name", err)
		}
		if err := services.RenameArtist(e.App, e.Request.PathValue("id"), body.Name); err != nil {
			return renameError(e, err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})

	g.POST("/albums/{id}/check", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		result, err := services.CheckAlbum(e.Request.Context(), e.App, e.Request.PathValue("id"))
		if err != nil {
			return e.InternalServerError("check album", err)
		}
		return e.JSON(http.StatusOK, result)
	})

	g.POST("/albums/{id}/cover", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		if err := services.RefreshAlbumCover(e.Request.Context(), e.App, e.Request.PathValue("id")); err != nil {
			return e.BadRequestError(err.Error(), err)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})

	g.POST("/albums/{id}/resync", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}
		id := e.Request.PathValue("id")
		task := deps.Tasks.Create("resync", albumName(e.App, id))
		go services.ResyncAlbum(context.Background(), e.App, deps.Tasks, deps.Cache, task.ID, id)
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
	g.GET("/playlists", func(e *core.RequestEvent) error {
		uid := userID(e)
		if uid == "" {
			return e.UnauthorizedError("authentication required", nil)
		}
		likes, err := e.App.FindRecordsByFilter("playlist_ratings", "user = {:u} && value = 'like'", "", 0, 0, dbx.Params{"u": uid})
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

	g.POST("/playlists", func(e *core.RequestEvent) error {
		uid := userID(e)
		if uid == "" {
			return e.UnauthorizedError("authentication required", nil)
		}
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			TrackIDs    []string `json:"trackIds"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid body", err)
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			return e.BadRequestError("missing name", nil)
		}

		playlist, err := services.CreatePlaylist(e.App, uid, name, strings.TrimSpace(body.Description), body.TrackIDs)
		if err != nil {
			return e.InternalServerError("create failed", err)
		}
		return e.JSON(http.StatusCreated, playlist)
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

	g.POST("/events", func(e *core.RequestEvent) error {
		return streamEvents(e, deps)
	})
	g.GET("/tasks", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"tasks": deps.Tasks.List()})
	})
	g.DELETE("/tasks/completed", func(e *core.RequestEvent) error {
		deps.Tasks.ClearCompleted()
		return e.NoContent(http.StatusNoContent)
	})
}

// previewTimeout bounds a preview: reading a video's chapters can mean asking yt-dlp for its
// comments too, which is slow, but a request the caller is waiting on cannot hang for ever.
const previewTimeout = 2 * time.Minute

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

const sseKeepAlive = 25 * time.Second

// deviceGrace is how long a device that has lost its stream is given to come
// back before the playback is told it has gone. One missed keep-alive and the
// reconnection that follows it fit inside; a tab that was closed does not come
// back at all, and is out once it has passed.
const deviceGrace = 30 * time.Second

func writeKeepAlive(w io.Writer, flusher http.Flusher) {
	fmt.Fprintf(w, "event: %s\ndata: {}\n\n", eventPing)
	if flusher != nil {
		flusher.Flush()
	}
}

const (
	eventRegistered = "registered" // this client's own device, once, on connect
	eventDevices    = "devices"    // the user's device list, whenever it changes
	eventCommand    = "command"    // a transport action aimed at one device
	eventTask       = "task"       // progress of a background job
	eventPing       = "ping"       // proof of life, on a fixed schedule
)

func streamEvents(e *core.RequestEvent, deps *app.Deps) error {
	owner := userID(e)
	var identity struct {
		Type    string `json:"type"`
		Session string `json:"session"`
		Name    string `json:"name"`
		Volume  int    `json:"volume"`
	}
	_ = e.BindBody(&identity)

	var registered *devices.Device
	if identity.Session != "" {
		device, ok := deps.Devices.RegisterClient(owner, identity.Type, identity.Session, identity.Name, identity.Volume)
		if !ok {
			return e.BadRequestError("unregisterable device type", nil)
		}
		defer func() {
			// A device whose stream has ended is not playing any more, whatever
			// the record still says, so it leaves the set rather than being left
			// in it claiming to make sound.
			//
			// But a stream that ended and one that is about to come back look
			// the same from here. What tells them apart is whether the device
			// returns, which is known only afterwards, so the answer is given
			// afterwards: a tab that was closed is out a moment later, and one
			// whose connection blinked was never out at all. Registering again
			// takes a new epoch, which is what the delayed reading finds.
			time.AfterFunc(deviceGrace, func() {
				if !deps.Devices.UnregisterClient(owner, device.ID, device.Epoch()) {
					return
				}
				if _, err := deps.Player.Leave(context.Background(), owner, device.ID); err != nil {
					slog.Warn("a device that went away could not be taken out of the playback", "device", device.ID, "error", err)
				}
			})
		}()
		registered = &device
	}

	w := e.Response
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	if flusher != nil {
		flusher.Flush()
	}
	write := func(event string, payload any) {
		b, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
		if flusher != nil {
			flusher.Flush()
		}
	}

	if registered != nil {
		write(eventRegistered, *registered)
	}
	write(eventDevices, deps.Devices.List(owner))
	for _, t := range deps.Tasks.List() {
		write(eventTask, t)
	}

	deviceCh, commandCh, unsubDevices := deps.Devices.Subscribe(owner)
	defer unsubDevices()
	taskCh, unsubTasks := deps.Tasks.Subscribe()
	defer unsubTasks()
	keepAlive := time.NewTicker(sseKeepAlive)
	defer keepAlive.Stop()
	ctx := e.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-keepAlive.C:
			writeKeepAlive(w, flusher)
		case list, ok := <-deviceCh:
			if !ok {
				return nil
			}
			write(eventDevices, list)
		case command, ok := <-commandCh:
			if !ok {
				return nil
			}
			write(eventCommand, command)
		case task, ok := <-taskCh:
			if !ok {
				return nil
			}
			write(eventTask, task)
		}
	}
}

func streamUserID(e *core.RequestEvent, trackID string) (string, error) {
	if e.Auth != nil {
		return e.Auth.Id, nil
	}
	raw := e.Request.URL.Query().Get("token")
	if raw == "" {
		return "", e.UnauthorizedError("authentication required", nil)
	}
	uid, err := readStreamToken(e.App, raw, trackID)
	if err != nil {
		return "", e.UnauthorizedError("invalid stream token", err)
	}
	return uid, nil
}

func albumName(app core.App, id string) string {
	if rec, err := app.FindRecordById("albums", id); err == nil {
		return rec.GetString("name")
	}
	return ""
}

func speakerError(e *core.RequestEvent, err error) error {
	if errors.Is(err, players.ErrUnsupported) {
		return e.Error(http.StatusNotImplemented, "the device does not support this", err)
	}

	var fault *sonos.Fault
	if !errors.As(err, &fault) {
		return e.Error(http.StatusBadGateway, "the device could not be reached", err)
	}

	if fault.Code == sonos.TransitionNotAvailable {
		return e.Error(http.StatusConflict, "nothing is loaded on the speaker to play", err)
	}

	return e.Error(http.StatusBadGateway, fault.Error(), err)
}

func isAdmin(e *core.RequestEvent) bool {
	return e.Auth != nil && e.Auth.GetString("role") == "admin"
}

func userID(e *core.RequestEvent) string {
	if e.Auth != nil {
		return e.Auth.Id
	}
	return ""
}

func playOnDevice(e *core.RequestEvent, deps *app.Deps) error {
	dev, ok := usableDevice(deps, e)
	if !ok {
		return e.NotFoundError("device not found", nil)
	}
	ctx := e.Request.Context()
	trackID := e.Request.PathValue("trackId")
	var body struct {
		Position float64 `json:"position"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("invalid body", err)
	}
	position := rounded(body.Position)

	if clientDevice(deps, dev) {
		action := "play"
		if trackID != "" {
			action = fmt.Sprintf("play:%s:%d", trackID, position)
		}
		if !deps.Devices.SendCommand(dev.ID, action) {
			return e.NotFoundError("device not found", nil)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	}
	player, speaks := deps.Devices.PlayerFor(dev)
	if !speaks {
		return e.NotFoundError("device not found", nil)
	}
	if trackID == "" {
		if err := player.Play(ctx, dev.IPAddress); err != nil {
			return speakerError(e, err)
		}
		deps.Devices.WatchSpeaker(dev.ID)
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	}
	track, err := e.App.FindRecordById("tracks", trackID)
	if err != nil {
		return e.NotFoundError("track not found", err)
	}
	artist, album, artURL := "", "", ""
	if ids := track.GetStringSlice("artists"); len(ids) > 0 {
		if a, err := e.App.FindRecordById("artists", ids[0]); err == nil {
			artist = a.GetString("name")
		}
	}
	if al, err := e.App.FindRecordById("albums", track.GetString("album")); err == nil {
		album = al.GetString("name")
		artURL = deps.Devices.CoverURL(al.Id, al.GetString("cover"))
	}
	if !deps.Devices.Reachable() {
		return e.BadRequestError("the server public URL is not reachable from the device; set it in the admin settings", nil)
	}

	tok, err := mintStreamToken(e.App, e.Auth.Id, trackID)
	if err != nil {
		return e.InternalServerError("stream token", err)
	}
	format, mime := "mp3", "audio/mpeg"
	if native := services.MimeFor(services.LocalFormat(e.App, track)); native != "" && player.Accepts(ctx, dev.IPAddress, native) {
		if audio, err := services.LocalAudio(ctx, e.App, track); err == nil && player.Decodes(audio.SampleRate, audio.BitDepth) {
			format, mime = "", native
		}
	}

	streamURL := deps.Devices.StreamURL(trackID, tok, format)
	if err := player.PlayURL(ctx, dev.IPAddress, players.Track{
		URL:      streamURL,
		MimeType: mime,
		Title:    track.GetString("title"),
		Artist:   artist,
		Album:    album,
		ArtURL:   artURL,
		Duration: track.GetInt("duration"),
	}); err != nil {
		return speakerError(e, err)
	}

	if position > 0 {
		if err := player.Seek(ctx, dev.IPAddress, position); err != nil {
			slog.Warn("seek after handover failed", "device", dev.ID, "kind", dev.Type, "position", position, "error", err)
		}
	}

	deps.Devices.SetSpeakerTrack(dev.ID, userID(e), trackID, 0)
	deps.Devices.WatchSpeaker(dev.ID)
	return e.JSON(http.StatusOK, map[string]any{"success": true})
}

const coverThumbSize = "500x500"

const passwordMinLength = 8

func rounded(v float64) int {
	if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
		return 0
	}
	return int(math.Round(v))
}

func clientDevice(deps *app.Deps, d devices.Device) bool { return !deps.Devices.Speaks(d.Type) }

func usableDevice(deps *app.Deps, e *core.RequestEvent) (devices.Device, bool) {
	dev, ok := deps.Devices.Get(e.Request.PathValue("id"))
	if !ok || (!clientDevice(deps, dev) && !dev.Usable) {
		return devices.Device{}, false
	}
	return dev, true
}

func deviceAction(deps *app.Deps, action string, fn func(players.Player, context.Context, string) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		dev, ok := usableDevice(deps, e)
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		if clientDevice(deps, dev) {
			if !deps.Devices.SendCommand(dev.ID, action) {
				return e.NotFoundError("device not found", nil)
			}
			return e.JSON(http.StatusOK, map[string]any{"success": true})
		}
		player, speaks := deps.Devices.PlayerFor(dev)
		if !speaks {
			return e.NotFoundError("device not found", nil)
		}
		if err := fn(player, e.Request.Context(), dev.IPAddress); err != nil {
			return speakerError(e, err)
		}
		deps.Devices.WatchSpeaker(dev.ID)
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	}
}

func renameError(e *core.RequestEvent, err error) error {
	if errors.Is(err, services.ErrNameTaken) {
		return e.BadRequestError(err.Error(), err)
	}
	return e.InternalServerError("rename failed", err)
}

func ownedPlaylist(e *core.RequestEvent) (*core.Record, error) {
	uid := userID(e)
	if uid == "" {
		return nil, e.UnauthorizedError("authentication required", nil)
	}
	id := e.Request.PathValue("id")
	if _, err := e.App.FindFirstRecordByFilter("playlist_ratings", "user = {:u} && playlist = {:p} && value = 'like'", dbx.Params{"u": uid, "p": id}); err != nil {
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

func toSearchResponse(results []domain.SearchResult, provErrs []services.ProviderError) map[string]any {
	mapped := make([]map[string]any, 0, len(results))
	for _, r := range results {
		m := map[string]any{
			"type":          string(r.Type),
			"provider":      r.Source,
			"origin":        r.Origin,
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
