package routes

import (
	"errors"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/player"
)

func registerPlayer(se *core.ServeEvent, g *router.RouterGroup[*core.RequestEvent], deps *app.Deps) {
	service := player.NewService(player.NewStore(se.App), newPlayout(se.App, deps))
	deps.Player = service

	g.GET("/time", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"now": stamp(time.Now())})
	})

	g.GET("/player", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.State(owner)
	}))

	g.POST("/player/play", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			TrackID string   `json:"trackId"`
			Queue   []string `json:"queue"`
		}
		if err := e.BindBody(&body); err != nil || body.TrackID == "" {
			return player.State{}, errBadBody
		}
		for _, id := range body.Queue {
			if id == "" {
				return player.State{}, errBadBody
			}
		}
		return service.Play(e.Request.Context(), owner, body.TrackID, body.Queue)
	}))

	g.POST("/player/resume", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Resume(e.Request.Context(), owner)
	}))

	g.POST("/player/pause", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Pause(e.Request.Context(), owner)
	}))

	g.POST("/player/next", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Next(e.Request.Context(), owner)
	}))

	g.POST("/player/previous", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Previous(e.Request.Context(), owner)
	}))

	g.POST("/player/ended", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Ended(e.Request.Context(), owner)
	}))

	g.POST("/player/seek", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			Position float64 `json:"position"`
		}
		if err := e.BindBody(&body); err != nil {
			return player.State{}, errBadBody
		}
		return service.Seek(e.Request.Context(), owner, body.Position)
	}))

	g.POST("/player/queue", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		tracks, err := trackList(e)
		if err != nil {
			return player.State{}, err
		}
		return service.SetQueue(e.Request.Context(), owner, tracks)
	}))

	g.POST("/player/queue/add", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		tracks, err := trackList(e)
		if err != nil {
			return player.State{}, err
		}
		return service.Append(e.Request.Context(), owner, tracks)
	}))

	g.POST("/player/queue/remove", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			TrackID string `json:"trackId"`
		}
		if err := e.BindBody(&body); err != nil || body.TrackID == "" {
			return player.State{}, errBadBody
		}
		return service.Remove(e.Request.Context(), owner, body.TrackID)
	}))

	g.POST("/player/queue/clear", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.Clear(e.Request.Context(), owner)
	}))

	g.POST("/player/shuffle", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			Shuffle bool `json:"shuffle"`
		}
		if err := e.BindBody(&body); err != nil {
			return player.State{}, errBadBody
		}
		return service.SetShuffle(e.Request.Context(), owner, body.Shuffle)
	}))

	g.POST("/player/repeat", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			Repeat string `json:"repeat"`
		}
		if err := e.BindBody(&body); err != nil {
			return player.State{}, errBadBody
		}
		mode := player.Repeat(body.Repeat)
		if mode != player.RepeatNone && mode != player.RepeatAll && mode != player.RepeatOne {
			return player.State{}, errBadBody
		}
		return service.SetRepeat(e.Request.Context(), owner, mode)
	}))

	g.POST("/player/device", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			DeviceID string `json:"deviceId"`
		}
		if err := e.BindBody(&body); err != nil || body.DeviceID == "" {
			return player.State{}, errBadBody
		}
		if _, known := deps.Devices.Get(body.DeviceID); !known {
			return player.State{}, player.ErrNoDevice
		}
		return service.On(e.Request.Context(), owner, body.DeviceID)
	}))
}

var errBadBody = errors.New("invalid body")

func trackList(e *core.RequestEvent) ([]string, error) {
	var body struct {
		TrackIDs []string `json:"trackIds"`
	}
	if err := e.BindBody(&body); err != nil {
		return nil, errBadBody
	}
	for _, id := range body.TrackIDs {
		if id == "" {
			return nil, errBadBody
		}
	}
	return body.TrackIDs, nil
}

func order(run func(*core.RequestEvent, string) (player.State, error)) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		owner := userID(e)
		if owner == "" {
			return e.UnauthorizedError("authentication required", nil)
		}

		state, err := run(e, owner)
		if err != nil {
			return playerError(e, err)
		}
		return e.JSON(http.StatusOK, playing(state))
	}
}

func playerError(e *core.RequestEvent, err error) error {
	switch {
	case errors.Is(err, errBadBody):
		return e.BadRequestError("invalid body", err)
	case errors.Is(err, player.ErrNoDevice):
		return e.NotFoundError("device not found", err)
	case errors.Is(err, errNotReachable):
		return e.BadRequestError(errNotReachable.Error(), err)
	}
	return speakerError(e, err)
}

// playing is the record as a client reads it: the position it was last written
// at, the moment that was true, and the server's clock now, so that a client
// can place the playhead without trusting its own.
func playing(state player.State) map[string]any {
	queue := state.Queue
	if queue == nil {
		queue = []string{}
	}
	order := state.Order
	if order == nil {
		order = []int{}
	}
	return map[string]any{
		"track":      state.Track,
		"position":   state.Position,
		"positionAt": stamp(state.PositionAt),
		"playing":    state.Playing,
		"device":     state.Device,
		"queue":      queue,
		"order":      order,
		"index":      state.Index,
		"shuffle":    state.Shuffle,
		"repeat":     string(state.Repeat),
		"now":        stamp(time.Now()),
	}
}

func stamp(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	return at.UTC().Format(time.RFC3339Nano)
}
