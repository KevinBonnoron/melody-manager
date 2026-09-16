package devices

import (
	"context"
	"testing"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

type stubPlayer struct {
	found    []players.Found
	onVolume func()
}

func (stubPlayer) Kind() string { return "stub" }

func (p stubPlayer) Discover(context.Context, time.Duration) []players.Found { return p.found }

func (stubPlayer) Describe(context.Context, string) (players.Found, bool) {
	return players.Found{}, false
}

func (p stubPlayer) Volume(context.Context, string) int {
	if p.onVolume != nil {
		p.onVolume()
	}
	return 20
}

func (stubPlayer) PlayURL(context.Context, string, players.Track) error { return nil }
func (stubPlayer) Play(context.Context, string) error                   { return nil }
func (stubPlayer) Pause(context.Context, string) error                  { return nil }
func (stubPlayer) Stop(context.Context, string) error                   { return nil }
func (stubPlayer) Next(context.Context, string) error                   { return nil }
func (stubPlayer) Previous(context.Context, string) error               { return nil }
func (stubPlayer) Seek(context.Context, string, int) error              { return nil }
func (stubPlayer) SetVolume(context.Context, string, int) error         { return nil }
func (stubPlayer) Transport(context.Context, string) string             { return "STOPPED" }
func (stubPlayer) Position(context.Context, string) (int, int)          { return 0, 0 }
func (stubPlayer) CurrentURL(context.Context, string) string            { return "" }
func (stubPlayer) Accepts(context.Context, string, string) bool         { return true }
func (stubPlayer) Decodes(int, int) bool                                { return true }

// Asking a speaker for its volume is a network round trip, and one speaker that
// has stopped answering takes the full timeout to say so. Under the registry's
// write lock that waits out every reader with it: /api/devices, the event stream
// and anything else that only wanted to know what exists.
func TestDiscoveryDoesNotHoldTheLockWhileAskingSpeakers(t *testing.T) {
	asked := make(chan struct{})
	answer := make(chan struct{})
	player := stubPlayer{
		found: []players.Found{{Address: "192.168.0.9", Name: "Salon"}},
		onVolume: func() {
			close(asked)
			<-answer
		},
	}

	service := New(func() string { return "http://127.0.0.1:8090" })
	service.SetPlayers(players.Registry{player.Kind(): player})

	discovered := make(chan struct{})
	go func() {
		service.discoverKind(player)
		close(discovered)
	}()

	<-asked
	read := make(chan struct{})
	go func() {
		service.List("")
		close(read)
	}()

	select {
	case <-read:
	case <-time.After(2 * time.Second):
		close(answer)
		t.Fatal("a reader waited on a speaker that had not answered yet")
	}

	close(answer)
	<-discovered
}

// The other half of the same rule: what the speaker said still has to reach the
// registry.
func TestDiscoveryRecordsWhatTheSpeakerAnswered(t *testing.T) {
	player := stubPlayer{found: []players.Found{{Address: "192.168.0.9", Name: "Salon"}}}

	service := New(func() string { return "http://127.0.0.1:8090" })
	service.SetPlayers(players.Registry{player.Kind(): player})
	service.discoverKind(player)

	list := service.List("")
	if len(list) != 1 {
		t.Fatalf("discovery kept %d devices, want 1", len(list))
	}
	if list[0].Name != "Salon" || list[0].Volume != 20 || list[0].Type != "stub" {
		t.Errorf("unexpected device: %+v", list[0])
	}
}
