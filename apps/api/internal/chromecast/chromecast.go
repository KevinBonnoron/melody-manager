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

func alive(c *conn) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.closed
}

func (d *Devices) session(ctx context.Context, address string) (*conn, error) {
	d.mu.Lock()
	if existing, ok := d.conns[address]; ok {
		if alive(existing) {
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
	if winner, ok := d.conns[address]; ok && alive(winner) {
		d.mu.Unlock()
		opened.Close()
		return winner, nil
	}
	d.conns[address] = opened
	d.mu.Unlock()
	return opened, nil
}

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
			"streamType":  "BUFFERED",
			"duration":    track.Duration,
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

// A track handed over on its own is not a queue, and the default receiver has nothing to move
// to.
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

func (d *Devices) status(ctx context.Context, address string) (mediaStatus, bool) {
	c, err := d.session(ctx, address)
	if err != nil {
		return mediaStatus{}, false
	}

	c.mu.Lock()
	transport := c.transport
	c.mu.Unlock()
	if transport == "" {
		return mediaStatus{}, false
	}

	if _, err := c.ask(ctx, nsMedia, transport, map[string]any{"type": "GET_STATUS"}); err != nil {
		return mediaStatus{}, false
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastStatus, true
}

// Transport translates what a Chromecast calls its state into the words the rest of the server
// uses, which are UPnP's because Sonos got here first.
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

const (
	maxSampleRate = 48000
	maxBitDepth   = 24
)

func (*Devices) Decodes(sampleRate, bitDepth int) bool {
	return sampleRate > 0 && sampleRate <= maxSampleRate && bitDepth <= maxBitDepth
}

// Describe asks one address whether a Chromecast answers there, and what it calls itself.
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
