package routes

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/player"
	"github.com/KevinBonnoron/melody-manager/api/internal/players"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
)

// errNotReachable is the server having no address a speaker could fetch a stream from.
var errNotReachable = errors.New("the server public URL is not reachable from the device; set it in the admin settings")

// playout carries the player's orders to the device the record names.
type playout struct {
	app  core.App
	deps *app.Deps
}

func newPlayout(a core.App, deps *app.Deps) *playout {
	return &playout{app: a, deps: deps}
}

func (p *playout) Play(ctx context.Context, owner, device, trackID string, position float64) error {
	dev, speaker, ok, err := p.target(device)
	if err != nil || !ok {
		return err
	}
	if speaker == nil {
		return p.command(dev, fmt.Sprintf("play:%s:%d", trackID, rounded(position)))
	}
	return p.load(ctx, dev, speaker, owner, trackID, position)
}

// Resume asks a device to carry on. A speaker that has been sitting idle may
// have nothing left to carry on with, so what it holds is checked against the
// record first: a stream for another track, or one whose token has since
// expired, is reloaded rather than resumed into a failure.
func (p *playout) Resume(ctx context.Context, owner, device, trackID string, position float64) error {
	dev, speaker, ok, err := p.target(device)
	if err != nil || !ok {
		return err
	}
	if speaker == nil {
		return p.command(dev, "resume")
	}

	if !p.holdsStream(ctx, speaker, dev, trackID) {
		return p.load(ctx, dev, speaker, owner, trackID, position)
	}
	if err := speaker.Play(ctx, dev.IPAddress); err != nil {
		return err
	}
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}

func (p *playout) Pause(ctx context.Context, _, device string) error {
	dev, speaker, ok, err := p.target(device)
	if err != nil || !ok {
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

func (p *playout) Seek(ctx context.Context, _, device string, position float64) error {
	dev, speaker, ok, err := p.target(device)
	if err != nil || !ok {
		return err
	}
	if speaker == nil {
		return p.command(dev, fmt.Sprintf("seek:%d", rounded(position)))
	}
	if err := speaker.Seek(ctx, dev.IPAddress, rounded(position)); err != nil {
		return err
	}
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}

// target resolves the device the record names. A record naming nowhere has
// nothing to drive, which is not a failure.
func (p *playout) target(device string) (devices.Device, players.Player, bool, error) {
	if device == "" {
		return devices.Device{}, nil, false, nil
	}

	dev, known := p.deps.Devices.Get(device)
	if !known {
		return devices.Device{}, nil, false, player.ErrNoDevice
	}
	if !p.deps.Devices.Speaks(dev.Type) {
		return dev, nil, true, nil
	}
	if !dev.Usable {
		return devices.Device{}, nil, false, player.ErrNoDevice
	}
	speaker, speaks := p.deps.Devices.PlayerFor(dev)
	if !speaks {
		return devices.Device{}, nil, false, player.ErrNoDevice
	}
	return dev, speaker, true, nil
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

func (p *playout) load(ctx context.Context, dev devices.Device, speaker players.Player, owner, trackID string, position float64) error {
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

	if at := rounded(position); at > 0 {
		if err := speaker.Seek(ctx, dev.IPAddress, at); err != nil {
			slog.Warn("seek after loading a track failed", "device", dev.ID, "kind", dev.Type, "position", at, "error", err)
		}
	}

	p.deps.Devices.SetSpeakerTrack(dev.ID, owner, trackID)
	p.deps.Devices.WatchSpeaker(dev.ID)
	return nil
}
