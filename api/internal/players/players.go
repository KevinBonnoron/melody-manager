// Package players is the shape a speaker has to take for the rest of the server
// to ask it for sound. Sonos speaks SSDP and SOAP, a Chromecast speaks mDNS and
// CASTV2 over TLS, and nothing above this line should have to know which.
package players

import (
	"context"
	"errors"
	"time"
)

// ErrUnsupported is what a player answers when the protocol has no such idea.
// A Chromecast handed a single track has no queue, so asking it for the next
// one is not a failure to report to anybody.
var ErrUnsupported = errors.New("the device does not support this")

// Found is a device answering on the network.
type Found struct {
	Address string
	Name    string
	// The identity the device gives itself, stable across addresses. A speaker
	// that moves to a new lease is the same speaker.
	ID string
}

// Track is what a device is handed to play. It fetches the URL itself, so the
// address has to be one it can reach, not one this server calls itself.
type Track struct {
	URL      string
	MimeType string
	Title    string
	Artist   string
	Album    string
	ArtURL   string
	Duration int
}

// Player controls one kind of device.
type Player interface {
	// Kind names the device type, matching the provider it is configured under.
	Kind() string

	// Discover asks the network who is there. Multicast, so it does not cross a
	// bridged network, which is why an address can also be given by hand.
	Discover(ctx context.Context, timeout time.Duration) []Found
	// Describe asks one address directly, for the speakers discovery cannot see
	// and for the ones that stop answering a broadcast while still serving
	// everything else.
	Describe(ctx context.Context, address string) (Found, bool)

	PlayURL(ctx context.Context, address string, track Track) error
	Play(ctx context.Context, address string) error
	Pause(ctx context.Context, address string) error
	Stop(ctx context.Context, address string) error
	Next(ctx context.Context, address string) error
	Previous(ctx context.Context, address string) error
	Seek(ctx context.Context, address string, seconds int) error

	SetVolume(ctx context.Context, address string, volume int) error
	Volume(ctx context.Context, address string) int

	// Transport is what the device says it is doing: PLAYING, PAUSED_PLAYBACK,
	// STOPPED, TRANSITIONING.
	Transport(ctx context.Context, address string) string
	Position(ctx context.Context, address string) (elapsed int, duration int)
	// CurrentURL is what the device is playing, so a server that restarted can
	// recognise a URL it handed out and pick the session back up.
	CurrentURL(ctx context.Context, address string) string

	// Accepts reports whether the device takes this container at all, and Decodes
	// whether it can make sense of what is inside it. Both are needed: a device
	// says yes to audio/flac and then stops three seconds into a 24-bit 192 kHz
	// one, having buffered what it could and found nothing to do with it.
	Accepts(ctx context.Context, address, mime string) bool
	Decodes(sampleRate, bitDepth int) bool
}

// Registry holds the player for each kind of device.
type Registry map[string]Player

func (r Registry) For(kind string) (Player, bool) {
	p, ok := r[kind]
	return p, ok
}

// Kinds lists what this server can talk to, in no particular order.
func (r Registry) Kinds() []string {
	out := make([]string, 0, len(r))
	for kind := range r {
		out = append(out, kind)
	}
	return out
}
