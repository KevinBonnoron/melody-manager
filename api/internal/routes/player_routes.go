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

var errBadBody = errors.New("invalid body")

func registerPlayer(se *core.ServeEvent, g *router.RouterGroup[*core.RequestEvent], deps *app.Deps) {
	service := player.NewService(player.NewStore(se.App), newPlayout(se.App, deps), player.NewLibrary(se.App))
	deps.Player = service

	g.GET("/time", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"now": moment(time.Now())})
	})

	g.GET("/player", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		return service.State(owner)
	}))

	g.POST("/player/play", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			Tracks []string `json:"tracks"`
		}
		if err := e.BindBody(&body); err != nil || len(body.Tracks) == 0 {
			return player.State{}, errBadBody
		}
		for _, id := range body.Tracks {
			if id == "" {
				return player.State{}, errBadBody
			}
		}
		return service.Start(e.Request.Context(), owner, body.Tracks)
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

	g.POST("/player/skip", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		trackID, err := track(e)
		if err != nil {
			return player.State{}, err
		}
		return service.Skip(e.Request.Context(), owner, trackID)
	}))

	g.POST("/player/ended", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			TrackID string `json:"trackId"`
			Cycle   int64  `json:"cycle"`
		}
		if err := e.BindBody(&body); err != nil || body.TrackID == "" {
			return player.State{}, errBadBody
		}
		return service.Ended(e.Request.Context(), owner, body.TrackID, body.Cycle)
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

	g.POST("/player/add", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		trackID, err := track(e)
		if err != nil {
			return player.State{}, err
		}
		return service.AddNext(e.Request.Context(), owner, trackID)
	}))

	g.POST("/player/remove", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		trackID, err := track(e)
		if err != nil {
			return player.State{}, err
		}
		return service.Remove(e.Request.Context(), owner, trackID)
	}))

	g.POST("/player/clear", order(func(e *core.RequestEvent, owner string) (player.State, error) {
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

	g.POST("/player/devices", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		var body struct {
			DeviceIDs []string `json:"deviceIds"`
		}
		if err := e.BindBody(&body); err != nil {
			return player.State{}, errBadBody
		}
		for _, id := range body.DeviceIDs {
			if err := known(deps, owner, id); err != nil {
				return player.State{}, err
			}
		}
		return service.On(e.Request.Context(), owner, body.DeviceIDs)
	}))

	g.POST("/player/join", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		id, err := device(e)
		if err != nil {
			return player.State{}, err
		}
		if err := known(deps, owner, id); err != nil {
			return player.State{}, err
		}
		return service.Join(e.Request.Context(), owner, id)
	}))

	g.POST("/player/leave", order(func(e *core.RequestEvent, owner string) (player.State, error) {
		id, err := device(e)
		if err != nil {
			return player.State{}, err
		}
		return service.Leave(e.Request.Context(), owner, id)
	}))
}

func track(e *core.RequestEvent) (string, error) {
	var body struct {
		TrackID string `json:"trackId"`
	}
	if err := e.BindBody(&body); err != nil || body.TrackID == "" {
		return "", errBadBody
	}
	return body.TrackID, nil
}

func device(e *core.RequestEvent) (string, error) {
	var body struct {
		DeviceID string `json:"deviceId"`
	}
	if err := e.BindBody(&body); err != nil || body.DeviceID == "" {
		return "", errBadBody
	}
	return body.DeviceID, nil
}

// known refuses a device the server has never heard of, so that the record
// never names somewhere the sound cannot come out.
func known(deps *app.Deps, owner, id string) error {
	if id == "" {
		return errBadBody
	}
	if _, ok := deps.Devices.GetFor(owner, id); !ok {
		return player.ErrNoDevice
	}
	return nil
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
	case errors.Is(err, player.ErrNowhereToPlay):
		return e.Error(http.StatusConflict, "there is nowhere to play this", err)
	case errors.Is(err, errNotReachable):
		return e.BadRequestError(errNotReachable.Error(), err)
	}
	return speakerError(e, err)
}

// playing is the record as a client reads it: the position it was last written
// at, the moment that was true, and the server's clock now, so that a client
// can place the playhead without trusting its own.
func playing(state player.State) map[string]any {
	list := state.List
	if list == nil {
		list = []string{}
	}
	devices := state.Devices
	if devices == nil {
		devices = []string{}
	}
	order := state.Order
	if order == nil {
		order = []int{}
	}
	return map[string]any{
		"track":      state.Track,
		"position":   state.Position,
		"positionAt": moment(state.PositionAt),
		"playing":    state.Playing,
		"devices":    devices,
		"list":       list,
		"order":      order,
		"index":      state.Index,
		"shuffle":    state.Shuffle,
		"repeat":     string(state.Repeat),
		"now":        moment(time.Now()),
	}
}

func moment(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	return at.UTC().Format(time.RFC3339Nano)
}
