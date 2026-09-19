package routes

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/player"
	"github.com/KevinBonnoron/melody-manager/api/internal/players"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
)

// errNotReachable is the server having no address a speaker could fetch a stream from.
var errNotReachable = errors.New("the server public URL is not reachable from the device; set it in the admin settings")

// at writes a position for a device that can hold one precisely. Whole seconds
// are what UPnP takes and what a speaker can be told; a playhead is not that
// coarse, and rounding one to the nearest second moves it either way.
func at(position float64) string {
	if position < 0 {
		position = 0
	}
	return strconv.FormatFloat(position, 'f', 3, 64)
}

// startsAt writes when the sound is to start, in the server's own clock, which is
// the one every device has measured itself against. Nothing is a start at once.
func startsAt(start time.Time) string {
	if start.IsZero() {
		return "0"
	}
	return strconv.FormatInt(start.UnixMilli(), 10)
}

// playout carries the player's orders to one device at a time.
type playout struct {
	app  core.App
	deps *app.Deps
}

func newPlayout(a core.App, deps *app.Deps) *playout {
	return &playout{app: a, deps: deps}
}

func (p *playout) Play(ctx context.Context, owner, device, trackID string, position float64, cycle int64, start time.Time) error {
	dev, speaker, err := p.target(owner, device)
	if err != nil {
		return err
	}
	if speaker == nil {
		return p.command(dev, fmt.Sprintf("play:%s:%s:%s:%d", trackID, at(position), startsAt(start), cycle))
	}
	return p.load(ctx, dev, speaker, owner, trackID, position, cycle)
}

// Resume asks a device to carry on. A speaker that has been sitting idle may
// have nothing left to carry on with, so what it holds is checked against the
// record first: a stream for another track, or one whose token has since
// expired, is reloaded rather than resumed into a failure.
func (p *playout) Resume(ctx context.Context, owner, device, trackID string, position float64, cycle int64, start time.Time) error {
	dev, speaker, err := p.target(owner, device)
	if err != nil {
		return err
	}
	if speaker == nil {
		// A browser that has just been reloaded holds nothing to carry on with
		// either, so what to resume travels with the order and the client loads
		// it when it is not already the one it has.
		return p.command(dev, fmt.Sprintf("resume:%s:%s:%s:%d", trackID, at(position), startsAt(start), cycle))
	}

	if !p.holdsStream(ctx, speaker, dev, trackID) {
		return p.load(ctx, dev, speaker, owner, trackID, position, cycle)
	}
	p.deps.Devices.SetSpeakerTrack(dev.ID, owner, trackID, cycle)
	if err := speaker.Play(ctx, dev.IPAddress); err != nil {
		return err
	}
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}

func (p *playout) Pause(ctx context.Context, owner, device string) error {
	dev, speaker, err := p.target(owner, device)
	if err != nil {
		return err
	}
	if speaker == nil {
		return p.command(dev, "pause")
	}
	if err := speaker.Pause(ctx, dev.IPAddress); err != nil {
		return err
	}
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}

func (p *playout) Seek(ctx context.Context, owner, device string, position float64) error {
	dev, speaker, err := p.target(owner, device)
	if err != nil {
		return err
	}
	if speaker == nil {
		return p.command(dev, fmt.Sprintf("seek:%s", at(position)))
	}
	if err := speaker.Seek(ctx, dev.IPAddress, rounded(position)); err != nil {
		return err
	}
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}

func (p *playout) target(owner, device string) (devices.Device, players.Player, error) {
	dev, known := p.deps.Devices.GetFor(owner, device)
	if !known {
		return devices.Device{}, nil, player.ErrNoDevice
	}
	if !p.deps.Devices.Speaks(dev.Type) {
		return dev, nil, nil
	}
	if !dev.Usable {
		return devices.Device{}, nil, player.ErrNoDevice
	}
	speaker, speaks := p.deps.Devices.PlayerFor(dev)
	if !speaks {
		return devices.Device{}, nil, player.ErrNoDevice
	}
	return dev, speaker, nil
}

func (p *playout) command(dev devices.Device, action string) error {
	if !p.deps.Devices.SendCommand(dev.ID, action) {
		return player.ErrNoDevice
	}
	return nil
}

func (p *playout) holdsStream(ctx context.Context, speaker players.Player, dev devices.Device, trackID string) bool {
	raw := speaker.CurrentURL(ctx, dev.IPAddress)
	if raw == "" {
		return false
	}

	loaded, err := url.Parse(raw)
	if err != nil || !strings.HasPrefix(loaded.Path, "/api/tracks/"+trackID+"/stream") {
		return false
	}
	_, err = readStreamToken(p.app, loaded.Query().Get("token"), trackID)
	return err == nil
}

func (p *playout) load(ctx context.Context, dev devices.Device, speaker players.Player, owner, trackID string, position float64, cycle int64) error {
	track, err := p.app.FindRecordById("tracks", trackID)
	if err != nil {
		return err
	}
	if !p.deps.Devices.Reachable() {
		return errNotReachable
	}

	token, err := mintStreamToken(p.app, owner, trackID)
	if err != nil {
		return err
	}

	artist, album, artURL := "", "", ""
	if ids := track.GetStringSlice("artists"); len(ids) > 0 {
		if a, err := p.app.FindRecordById("artists", ids[0]); err == nil {
			artist = a.GetString("name")
		}
	}
	if al, err := p.app.FindRecordById("albums", track.GetString("album")); err == nil {
		album = al.GetString("name")
		artURL = p.deps.Devices.CoverURL(al.Id, al.GetString("cover"))
	}

	format, mime := "mp3", "audio/mpeg"
	if native := services.MimeFor(services.LocalFormat(p.app, track)); native != "" && speaker.Accepts(ctx, dev.IPAddress, native) {
		if audio, err := services.LocalAudio(ctx, p.app, track); err == nil && speaker.Decodes(audio.SampleRate, audio.BitDepth) {
			format, mime = "", native
		}
	}

	if err := speaker.PlayURL(ctx, dev.IPAddress, players.Track{
		URL:      p.deps.Devices.StreamURL(trackID, token, format),
		MimeType: mime,
		Title:    track.GetString("title"),
		Artist:   artist,
		Album:    album,
		ArtURL:   artURL,
		Duration: track.GetInt("duration"),
	}); err != nil {
		return err
	}

	if seconds := rounded(position); seconds > 0 {
		if err := speaker.Seek(ctx, dev.IPAddress, seconds); err != nil {
			if stopErr := speaker.Stop(ctx, dev.IPAddress); stopErr != nil {
				slog.Warn("a device left playing from the start could not be stopped", "device", dev.ID, "kind", dev.Type, "error", stopErr)
			}
			return err
		}
	}

	p.deps.Devices.SetSpeakerTrack(dev.ID, owner, trackID, cycle)
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}
