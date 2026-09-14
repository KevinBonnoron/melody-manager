package chromecast

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// Kind is the provider a Chromecast is configured under.
const Kind = "chromecast"

// Devices speaks CASTV2 to Chromecasts, holding a session open per device.
type Devices struct {
	mu    sync.Mutex
	conns map[string]*conn
}

func NewPlayer() players.Player { return &Devices{conns: map[string]*conn{}} }

func (*Devices) Kind() string { return Kind }

// session hands back the open connection for an address, opening one if there
// is none or if the last one died. A device that went away and came back gets a
// new session rather than commands into a closed socket.
func (d *Devices) session(ctx context.Context, address string) (*conn, error) {
	d.mu.Lock()
	existing, ok := d.conns[address]
	if ok {
		existing.mu.Lock()
		alive := !existing.closed
		existing.mu.Unlock()
		if alive {
			d.mu.Unlock()
			return existing, nil
		}
		delete(d.conns, address)
	}
	d.mu.Unlock()

	opened, err := dial(ctx, address)
	if err != nil {
		return nil, err
	}

	d.mu.Lock()
	// Another call may have opened one while this was dialling. One session per
	// device: two senders on one device is a way to have each undo the other.
	if winner, ok := d.conns[address]; ok {
		d.mu.Unlock()
		opened.Close()
		return winner, nil
	}
	d.conns[address] = opened
	d.mu.Unlock()
	return opened, nil
}

// receiver makes sure the default media receiver is running and that we are
// connected to it, and answers with the id to address media commands to. A
// Chromecast will not take a LOAD until an app is up and a session has been
// opened with that app, separately from the one opened with the device.
func (d *Devices) receiver(ctx context.Context, c *conn) (string, error) {
	c.mu.Lock()
	transport := c.transport
	c.mu.Unlock()
	if transport != "" {
		return transport, nil
	}

	if _, err := c.ask(ctx, nsReceiver, receiverID, map[string]any{"type": "LAUNCH", "appId": defaultReceiver}); err != nil {
		return "", err
	}

	c.mu.Lock()
	transport = c.transport
	c.mu.Unlock()
	if transport == "" {
		return "", fmt.Errorf("chromecast: %s launched no media receiver", c.address)
	}

	if err := c.send(nsConnection, transport, map[string]any{"type": "CONNECT"}); err != nil {
		return "", err
	}
	return transport, nil
}

func (d *Devices) PlayURL(ctx context.Context, address string, track players.Track) error {
	c, err := d.session(ctx, address)
	if err != nil {
		return err
	}
	transport, err := d.receiver(ctx, c)
	if err != nil {
		return err
	}

	images := []map[string]any{}
	if track.ArtURL != "" {
		images = append(images, map[string]any{"url": track.ArtURL})
	}

	_, err = c.ask(ctx, nsMedia, transport, map[string]any{
		"type": "LOAD",
		"media": map[string]any{
			"contentId":   track.URL,
			"contentType": track.MimeType,
			// BUFFERED, not LIVE: the server serves a file of known length, and a
			// device told it is live refuses to seek in it.
			"streamType": "BUFFERED",
			"duration":   track.Duration,
			"metadata": map[string]any{
				"metadataType": 3,
				"title":        track.Title,
				"artist":       track.Artist,
				"albumName":    track.Album,
				"images":       images,
			},
		},
		"autoplay":    true,
		"currentTime": 0,
	})
	return err
}

// mediaCommand addresses the session inside the running app. Both ids are
// needed and neither is ours to invent.
func (d *Devices) mediaCommand(ctx context.Context, address, kind string, extra map[string]any) error {
	c, err := d.session(ctx, address)
	if err != nil {
		return err
	}
	transport, err := d.receiver(ctx, c)
	if err != nil {
		return err
	}

	c.mu.Lock()
	session := c.mediaSession
	c.mu.Unlock()
	if session == 0 {
		// Nothing loaded, so nothing to move. Asking anyway has the device answer
		// INVALID_MEDIA_SESSION_ID, which says the same thing later and less well.
		return fmt.Errorf("chromecast: %s is holding no media", address)
	}

	payload := map[string]any{"type": kind, "mediaSessionId": session}
	for k, v := range extra {
		payload[k] = v
	}
	_, err = c.ask(ctx, nsMedia, transport, payload)
	return err
}

func (d *Devices) Play(ctx context.Context, address string) error {
	return d.mediaCommand(ctx, address, "PLAY", nil)
}

func (d *Devices) Pause(ctx context.Context, address string) error {
	return d.mediaCommand(ctx, address, "PAUSE", nil)
}

func (d *Devices) Stop(ctx context.Context, address string) error {
	return d.mediaCommand(ctx, address, "STOP", nil)
}

// A track handed over on its own is not a queue, and the default receiver has
// nothing to move to. The server holds the queue and sends the next track as
// its own LOAD.
func (d *Devices) Next(context.Context, string) error     { return players.ErrUnsupported }
func (d *Devices) Previous(context.Context, string) error { return players.ErrUnsupported }

func (d *Devices) Seek(ctx context.Context, address string, seconds int) error {
	return d.mediaCommand(ctx, address, "SEEK", map[string]any{"currentTime": seconds})
}

func (d *Devices) SetVolume(ctx context.Context, address string, volume int) error {
	c, err := d.session(ctx, address)
	if err != nil {
		return err
	}
	// The device speaks in a fraction of full scale, the rest of the server in
	// percent.
	_, err = c.ask(ctx, nsReceiver, receiverID, map[string]any{
		"type":   "SET_VOLUME",
		"volume": map[string]any{"level": float64(volume) / 100, "muted": false},
	})
	return err
}

func (d *Devices) Volume(ctx context.Context, address string) int {
	c, err := d.session(ctx, address)
	if err != nil {
		return 0
	}
	if _, err := c.ask(ctx, nsReceiver, receiverID, map[string]any{"type": "GET_STATUS"}); err != nil {
		return 0
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	return int(c.lastVolume*100 + 0.5)
}

// status refreshes what the device says it is doing. The answer also lands in
// the connection's own cache, through the dispatcher, so a caller wanting two
// things out of it asks once.
func (d *Devices) status(ctx context.Context, address string) (mediaStatus, bool) {
	c, err := d.session(ctx, address)
	if err != nil {
		return mediaStatus{}, false
	}

	c.mu.Lock()
	transport := c.transport
	c.mu.Unlock()
	if transport == "" {
		// No app running is a device sitting idle, not a device that failed to
		// answer. Launching one to ask would turn a poll into an interruption.
		return mediaStatus{}, false
	}

	if _, err := c.ask(ctx, nsMedia, transport, map[string]any{"type": "GET_STATUS"}); err != nil {
		return mediaStatus{}, false
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastStatus, true
}

// Transport translates what a Chromecast calls its state into the words the
// rest of the server uses, which are UPnP's because Sonos got here first.
func (d *Devices) Transport(ctx context.Context, address string) string {
	status, ok := d.status(ctx, address)
	if !ok {
		return "UNKNOWN"
	}
	return transportWord(status.State)
}

func transportWord(state string) string {
	switch state {
	case "PLAYING":
		return "PLAYING"
	case "PAUSED":
		return "PAUSED_PLAYBACK"
	case "BUFFERING":
		return "TRANSITIONING"
	case "IDLE":
		return "STOPPED"
	default:
		return "UNKNOWN"
	}
}

func (d *Devices) Position(ctx context.Context, address string) (int, int) {
	status, ok := d.status(ctx, address)
	if !ok {
		return 0, 0
	}
	return int(status.CurrentTime), int(status.Media.Duration)
}

func (d *Devices) CurrentURL(ctx context.Context, address string) string {
	status, ok := d.status(ctx, address)
	if !ok {
		return ""
	}
	return status.Media.ContentID
}

// What a Chromecast plays, from Google's own list of supported media. Unlike a
// Sonos there is nothing to ask the device: the answer is the same for every
// one of them, so it is written down rather than fetched.
var accepted = map[string]bool{
	"audio/mpeg":   true,
	"audio/mp3":    true,
	"audio/mp4":    true,
	"audio/aac":    true,
	"audio/flac":   true,
	"audio/x-flac": true,
	"audio/wav":    true,
	"audio/x-wav":  true,
	"audio/ogg":    true,
	"audio/webm":   true,
}

func (*Devices) Accepts(_ context.Context, _, mime string) bool {
	return accepted[strings.ToLower(strings.TrimSpace(mime))]
}

// 48 kHz, which is the rate every Chromecast takes, rather than the 96 kHz
// Google attaches to high resolution audio. That claim belongs to the
// Chromecast Audio, and there is one number here for every model: a video
// dongle handed a 96 kHz file would take it and stop partway through, silently,
// which is exactly the failure this rule exists to prevent. The cost of being
// wrong the other way is transcoding a file a Chromecast Audio could have taken
// as it was, which nobody hears.
//
// Telling the models apart is possible, the mDNS TXT record carries md=, but
// Decodes is asked about a file and not about a device, so it would take a wider
// question than this one.
const (
	maxSampleRate = 48000
	maxBitDepth   = 24
)

func (*Devices) Decodes(sampleRate, bitDepth int) bool {
	return sampleRate > 0 && sampleRate <= maxSampleRate && bitDepth <= maxBitDepth
}

// Describe asks one address whether a Chromecast answers there, and what it
// calls itself. The name comes from the setup endpoint on port 8008, which is
// plain HTTP and needs no session: a device that has to be typed in by hand,
// because discovery cannot reach it, would otherwise be listed by its address.
func (d *Devices) Describe(ctx context.Context, address string) (players.Found, bool) {
	name, id, ok := eurekaInfo(ctx, address)
	if !ok {
		return players.Found{}, false
	}
	if name == "" {
		name = address
	}
	return players.Found{Address: address, Name: name, ID: normaliseID(id)}, true
}

// The same device gives its id two ways: mDNS hands it over as bare hex, the
// setup endpoint as a hyphenated UUID. Left alone, a device discovered and the
// same device typed in by hand would be two identities.
func normaliseID(id string) string {
	return strings.ToLower(strings.ReplaceAll(id, "-", ""))
}

const setupPort = "8008"

func eurekaInfo(ctx context.Context, address string) (name, id string, ok bool) {
	url := "http://" + net.JoinHostPort(address, setupPort) + "/setup/eureka_info"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", "", false
	}

	client := &http.Client{Timeout: dialTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", false
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", "", false
	}

	var info struct {
		Name string `json:"name"`
		ID   string `json:"ssdp_udn"`
	}
	if json.NewDecoder(resp.Body).Decode(&info) != nil {
		return "", "", false
	}
	return info.Name, info.ID, true
}
