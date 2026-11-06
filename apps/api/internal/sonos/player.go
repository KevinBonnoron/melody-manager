package sonos

import (
	"context"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// Kind is the provider a Sonos speaker is configured under.
const Kind = "sonos"

// Speakers adapts this package to the shape the rest of the server asks in.
type Speakers struct{}

func NewPlayer() players.Player { return Speakers{} }

func (Speakers) Kind() string { return Kind }

func (Speakers) Discover(ctx context.Context, timeout time.Duration) []players.Found {
	found := Discover(ctx, timeout)
	out := make([]players.Found, 0, len(found))
	for _, p := range found {
		out = append(out, players.Found{Address: p.IP, Name: p.Name, ID: p.UUID})
	}
	return out
}

func (Speakers) Describe(ctx context.Context, address string) (players.Found, bool) {
	p, ok := Describe(ctx, address)
	if !ok {
		return players.Found{}, false
	}
	return players.Found{Address: p.IP, Name: p.Name, ID: p.UUID}, true
}

func (Speakers) PlayURL(ctx context.Context, address string, track players.Track) error {
	return PlayURL(ctx, address, Track{
		URL:      track.URL,
		MimeType: track.MimeType,
		Title:    track.Title,
		Artist:   track.Artist,
		Album:    track.Album,
		ArtURL:   track.ArtURL,
		Duration: track.Duration,
	})
}

func (Speakers) Play(ctx context.Context, address string) error  { return Play(ctx, address) }
func (Speakers) Pause(ctx context.Context, address string) error { return Pause(ctx, address) }
func (Speakers) Stop(ctx context.Context, address string) error  { return Stop(ctx, address) }
func (Speakers) Next(ctx context.Context, address string) error  { return Next(ctx, address) }
func (Speakers) Previous(ctx context.Context, address string) error {
	return Previous(ctx, address)
}

func (Speakers) Seek(ctx context.Context, address string, seconds int) error {
	return Seek(ctx, address, seconds)
}

func (Speakers) SetVolume(ctx context.Context, address string, volume int) error {
	return SetVolume(ctx, address, volume)
}

func (Speakers) Volume(ctx context.Context, address string) int { return GetVolume(ctx, address) }

func (Speakers) Transport(ctx context.Context, address string) string {
	return GetState(ctx, address)
}

func (Speakers) Position(ctx context.Context, address string) (int, int) {
	return Position(ctx, address)
}

func (Speakers) CurrentURL(ctx context.Context, address string) string {
	return CurrentURI(ctx, address)
}

func (Speakers) Accepts(ctx context.Context, address, mime string) bool {
	return Accepts(ctx, address, mime)
}

func (Speakers) Decodes(sampleRate, bitDepth int) bool { return Decodes(sampleRate, bitDepth) }
