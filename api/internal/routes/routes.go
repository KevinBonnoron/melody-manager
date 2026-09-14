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
)

// Register mounts the melody-specific endpoints. PocketBase already serves
// /api/health, /api/collections/* (used by the client to read library data),
// /api/realtime, /api/files/* and auth.
// appShellCORS answers the desktop and mobile shells with their own origin.
//
// Those clients are served from a scheme of their own, wails:// or capacitor://,
// so every call they make is cross-origin. PocketBase answers with a wildcard,
// which a WebKit webview refuses for a non-http scheme: it wants the exact
// origin echoed back. Nothing is widened here, the wildcard already allowed
// everyone; the header is narrowed so that a webview will accept it.
func appShellCORS() *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		// Ahead of PocketBase's own, which would otherwise answer the preflight
		// and stop there.
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
				// PocketBase's own CORS runs after this one and would overwrite
				// the header with its wildcard. Without an Origin to read it
				// leaves the response alone, which is what we want: the answer
				// has already been written here.
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

// isAppShellOrigin reports whether an origin belongs to a client shipped as an
// application rather than opened in a browser: those are the ones served from
// their own scheme.
func isAppShellOrigin(origin string) bool {
	scheme, _, found := strings.Cut(origin, "://")
	return found && scheme != "http" && scheme != "https"
}

func Register(se *core.ServeEvent, deps *app.Deps) {
	se.Router.Bind(appShellCORS())

	// Endpoints that cannot carry an Authorization header: <audio> elements set
	// the URL directly and Sonos speakers fetch it themselves. They authenticate
	// with a short-lived token in the query string instead (streamUserID), and
	// share links are meant to be opened by anonymous recipients.
	se.Router.GET("/api/tracks/{id}/stream", func(e *core.RequestEvent) error {
		trackID := e.Request.PathValue("id")
		uid, errResp := streamUserID(e, trackID)
		if errResp != nil {
			return errResp
		}
		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, trackID, e.Request.URL.Query().Get("transcode"), uid)
	})
	// A stable, public address for an album's artwork. Outside the authenticated
	// group for the same reason as the stream above: the speaker fetches it itself
	// and has no way to authenticate. The file was already public, this only gives
	// it a plain path with no query string, which Sonos is less fussy about than
	// the shape PocketBase happens to file it under.
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

		// The smaller copy is the one worth sending over the network; the
		// original is there when it was never generated.
		base := album.BaseFilesPath()
		thumb := fmt.Sprintf("%s/thumbs_%s/%s_%s", base, name, coverThumbSize, name)
		if err := fsys.Serve(e.Response, e.Request, thumb, name); err == nil {
			return nil
		}
		return fsys.Serve(e.Response, e.Request, base+"/"+name, name)
	})

	se.Router.GET("/api/tracks/{id}/peaks", func(e *core.RequestEvent) error {
		// The waveform is drawn from the same audio, so it is reached the same way
		// and by the same permission.
		uid, errResp := streamUserID(e, e.Request.PathValue("id"))
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
			return shareGone(e, "revoked")
		}
		if expiry := link.GetDateTime("expiresAt"); !expiry.IsZero() && expiry.Time().Before(time.Now()) {
			return shareGone(e, "expired")
		}

		// Range requests are how a player seeks, so only the first one counts as
		// somebody listening.
		if e.Request.Header.Get("Range") == "" {
			link.Set("plays", link.GetInt("plays")+1)
			if err := e.App.Save(link); err != nil {
				e.App.Logger().Warn("share play not counted", "token", link.GetString("token"), "error", err)
			}
		}

		return services.StreamTrack(e.Request.Context(), e.App, deps.Registry, deps.Cache, e, link.GetString("track"), e.Request.URL.Query().Get("transcode"), "")
	})

	// One endpoint, answering to what the caller is allowed to see: the login
	// screen needs a single flag before anyone is authenticated, the admin page
	// needs the whole file. Registered outside the group so the blanket auth
	// requirement does not apply.
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

	// Mints the token the player and Sonos append to stream URLs.
	g.GET("/stream-token", func(e *core.RequestEvent) error {
		// Per track: a token that opened anything the listener could read was a
		// session in a query string, and stream URLs are made to be handed out.
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
		// provider_config is admin-only, so the client cannot tell whether a
		// source has what its manifest says search needs. Answer it here.
		manifests := providers.Manifests()
		out := make([]providers.Manifest, 0, len(manifests))
		for _, mf := range manifests {
			mf.Unavailable = pbx.MissingConfig(e.App, mf.ID)
			out = append(out, mf)
		}
		return e.JSON(http.StatusOK, out)
	})

	// --- Configuration ---
	// Candidates rather than one answer: a machine with Wi-Fi, Ethernet and a
	// docker bridge has several addresses and only the operator knows which one
	// the speakers and phones sit behind.
	g.GET("/config/address-candidates", func(e *core.RequestEvent) error {
		if !isAdmin(e) {
			return e.ForbiddenError("admin only", nil)
		}

		scheme := "http"
		if e.Request.TLS != nil {
			scheme = "https"
		}

		// The port the caller reached us on is the one that demonstrably works.
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

		// Bound onto the current values, so a partial body only changes what it
		// carries rather than resetting the rest to zero.
		next := deps.Config.Get()
		if err := e.BindBody(&next); err != nil {
			return e.BadRequestError("invalid configuration", err)
		}
		if err := deps.Config.Save(next); err != nil {
			return e.InternalServerError("configuration not saved", err)
		}
		return e.JSON(http.StatusOK, next)
	})

	// --- Devices (Sonos speakers and the user's own open clients) ---
	g.GET("/devices", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"success": true, "data": deps.Devices.List(userID(e))})
	})
	// No register/heartbeat pair: a client declares itself when it opens its
	// stream and is gone the moment that stream ends. Only what it is playing
	// still has to be pushed, and only when it actually changes.
	g.POST("/devices/{id}/state", func(e *core.RequestEvent) error {
		uid := userID(e)
		if uid == "" {
			return e.UnauthorizedError("authentication required", nil)
		}
		var body struct {
			TrackID  string  `json:"trackId"`
			Playing  bool    `json:"playing"`
			Position float64 `json:"position"`
			Volume   int     `json:"volume"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("invalid state", err)
		}
		if !deps.Devices.ReportState(uid, e.Request.PathValue("id"), body.Playing, body.TrackID, body.Position, body.Volume) {
			return e.NotFoundError("device not found", nil)
		}
		return e.JSON(http.StatusOK, map[string]any{"success": true})
	})
	g.POST("/devices/{id}/play/{trackId}", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	g.POST("/devices/{id}/play", func(e *core.RequestEvent) error { return playOnDevice(e, deps) })
	// Method expressions, so the route names the thing to do and the device says
	// who does it. A client of the user's own is told over its own stream instead.
	g.POST("/devices/{id}/pause", deviceAction(deps, "pause", players.Player.Pause))
	g.POST("/devices/{id}/stop", deviceAction(deps, "stop", players.Player.Stop))
	g.POST("/devices/{id}/next", deviceAction(deps, "next", players.Player.Next))
	g.POST("/devices/{id}/previous", deviceAction(deps, "previous", players.Player.Previous))
	g.POST("/devices/{id}/seek", func(e *core.RequestEvent) error {
		dev, ok := usableDevice(deps, e)
		if !ok {
			return e.NotFoundError("device not found", nil)
		}
		// Seconds, not a whole number of them: the target comes from a click on a
		// progress bar. Binding it as an int silently left it at zero, and the
		// speaker obediently went back to the start of the track.
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
		return e.JSON(http.StatusAccepted, services.ScanLocalTask(context.Background(), e.App, deps.Tasks))
	})

	// Marks what can no longer be played instead of deleting it: the likes, the
	// play counts and the playlists pointing at a track outlive its file.
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

	// An admin is a role on a record, not a PocketBase superuser, so it cannot
	// set someone else's email or password through the collection API: both go
	// through a confirmation flow there. Everything else about a user is an
	// ordinary field the update rule already allows.
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

	// Renaming moves the folders on disk with the record, so the library and
	// the filesystem keep saying the same thing. It refuses rather than merges
	// when the destination is taken, and nothing is moved when it refuses.
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

	// Both answer about one album and finish in the time of the request, so
	// neither is worth a background task the caller would then have to follow.
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

	// A playlist of one's own: manual, empty, and in the library of whoever
	// asked for it, since that membership is what every playlist screen reads.
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

	// One stream for everything the server pushes: browsers cap concurrent
	// connections per origin, and a long-lived one holds a slot for as long as
	// the tab stays open.
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

// An idle stream carries no bytes for as long as nothing changes, which is
// exactly what proxies reap. It is a named event rather than a comment line so
// that it also serves as proof of life: a stream that ends cleanly raises no
// error a browser can see, and without something arriving on a known schedule a
// client cannot tell a quiet server from a dead one.
const sseKeepAlive = 25 * time.Second

func writeKeepAlive(w io.Writer, flusher http.Flusher) {
	fmt.Fprintf(w, "event: %s\ndata: {}\n\n", eventPing)
	if flusher != nil {
		flusher.Flush()
	}
}

// Events carried by the stream. One list, so what travels on it is readable in
// one place instead of being pieced together from the call sites.
const (
	eventRegistered = "registered" // this client's own device, once, on connect
	eventDevices    = "devices"    // the user's device list, whenever it changes
	eventCommand    = "command"    // a transport action aimed at one device
	eventTask       = "task"       // progress of a background job
	eventPing       = "ping"       // proof of life, on a fixed schedule
)

func streamEvents(e *core.RequestEvent, deps *app.Deps) error {
	owner := userID(e)
	// The body has to be read before anything is written back: once the response
	// headers are out, the request body is no longer reliably readable, and the
	// identity silently comes back empty.
	var identity struct {
		Type    string `json:"type"`
		Session string `json:"session"`
		Name    string `json:"name"`
	}
	// Tolerated empty on purpose, unlike the commands above: a client that only
	// wants to listen sends no identity and registers no device.
	_ = e.BindBody(&identity)

	var registered *devices.Device
	if identity.Session != "" {
		device, ok := deps.Devices.RegisterClient(owner, identity.Type, identity.Session, identity.Name)
		if !ok {
			return e.BadRequestError("unregisterable device type", nil)
		}
		defer deps.Devices.UnregisterClient(owner, device.ID, device.Epoch())
		registered = &device
	}

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

// streamUserID authenticates a request for one track's audio, either from the
// Authorization header or from the token minted for that track alone.
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

// albumName labels a task with its subject rather than a sentence.
func albumName(app core.App, id string) string {
	if rec, err := app.FindRecordById("albums", id); err == nil {
		return rec.GetString("name")
	}
	return ""
}

// speakerError reports what the speaker objected to, and says whose fault it
// is: a refusal is not an internal error, and "nothing to resume" is not a
// failure the caller can do anything about by retrying the same way.
func speakerError(e *core.RequestEvent, err error) error {
	// A device that has no such idea is not a device that failed. A Chromecast
	// handed one track has no queue, so asking it for the next one is a question
	// it cannot be asked, not an error to blame it for.
	if errors.Is(err, players.ErrUnsupported) {
		return e.Error(http.StatusNotImplemented, "the device does not support this", err)
	}

	var fault *sonos.Fault
	if !errors.As(err, &fault) {
		// No fault body: the device could not be reached at all.
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
	// The position rides along: handing playback over has to resume where the
	// other device was, not restart the track.
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
	// The device fetches the stream itself, so a loopback public URL points it at
	// itself. Say so rather than hand it an address it cannot use.
	if !deps.Devices.Reachable() {
		return e.BadRequestError("the server public URL is not reachable from the device; set it in the admin settings", nil)
	}

	tok, err := mintStreamToken(e.App, e.Auth.Id, trackID)
	if err != nil {
		return e.InternalServerError("stream token", err)
	}
	// Every speaker plays mp3, and some play more. Ask this one rather than
	// re-encoding a lossless file on the way to it, and ask about the file as
	// well as the container: a speaker says yes to audio/flac and then stops
	// three seconds into a 24-bit 192 kHz one, having buffered what it could and
	// found nothing to do with it. A probe that fails transcodes, which plays.
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

	// Handing playback over resumes where it was. Best effort: a speaker that
	// refuses to seek still plays, and losing the offset beats losing the track.
	if position > 0 {
		if err := player.Seek(ctx, dev.IPAddress, position); err != nil {
			slog.Warn("seek after handover failed", "device", dev.ID, "kind", dev.Type, "position", position, "error", err)
		}
	}

	deps.Devices.SetSpeakerTrack(dev.ID, userID(e), trackID)
	deps.Devices.WatchSpeaker(dev.ID)
	return e.JSON(http.StatusOK, map[string]any{"success": true})
}

// coverThumbSize is one of the sizes the albums collection generates.
const coverThumbSize = "500x500"

// passwordMinLength mirrors what PocketBase itself enforces, so a password it
// would refuse is refused here with a message that says why.
const passwordMinLength = 8

// rounded turns a value a browser computed, a position dragged on a bar or a
// level dragged on a slider, into the whole number the wire carries. Truncating
// would lose most of a second on every seek, which shows on a progress bar.
func rounded(v float64) int {
	if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
		return 0
	}
	return int(math.Round(v))
}

// A browser device has no address to talk to: the action reaches it over the
// stream it already listens on.
// Sonos speakers are driven over SOAP; a client of the user's own is reached
// through the stream it is already listening on.
// A device this server speaks a protocol to is on the network; everything else
// is a client of the user's own, told what to do over the stream it opened.
// This used to ask whether the type was "sonos", which made every kind added
// after it a browser tab, and playing to one went looking for a stream nobody
// had opened.
func clientDevice(deps *app.Deps, d devices.Device) bool { return !deps.Devices.Speaks(d.Type) }

// usableDevice looks up a device a request may act on. A speaker nobody agreed
// to play to is discovered all the same, so that an admin can be shown it; that
// is not the same as somewhere sound may be sent in the meantime.
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

// ownedPlaylist loads the playlist if the current user owns it (likes it),
// otherwise returns the appropriate error response.
// renameError tells apart the one failure the caller can do something about,
// a name already taken, from everything else.
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

// toSearchResponse maps internal results to the client's SearchResponse shape
// ({ results, providerErrors }) with the field names the TS types expect.
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
