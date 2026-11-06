// Package players is the shape a speaker has to take for the rest of the server to ask it for
// sound.
package players

import (
	"context"
	"errors"
	"time"
)

// ErrUnsupported is what a player answers when the protocol has no such idea.
var ErrUnsupported = errors.New("the device does not support this")

// Found is a device answering on the network.
type Found struct {
	Address string
	Name    string
	ID      string
}

// Track is what a device is handed to play.
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
	Kind() string

	Discover(ctx context.Context, timeout time.Duration) []Found
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

	Transport(ctx context.Context, address string) string
	Position(ctx context.Context, address string) (elapsed int, duration int)
	CurrentURL(ctx context.Context, address string) string

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
