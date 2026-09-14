package devices

import (
	"testing"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// Drift is what a playing device accumulates on its own; a seek is what lands
// away from where it was heading. Confusing the two either floods every client
// with position messages or hides the one move they need to see.
func TestPositionJumped(t *testing.T) {
	cases := []struct {
		name     string
		device   Device
		position float64
		want     bool
	}{
		{"drift while playing", Device{Playing: true, Position: 10, reportedAt: time.Now().Add(-5 * time.Second)}, 15, false},
		{"seek forward while playing", Device{Playing: true, Position: 10, reportedAt: time.Now().Add(-5 * time.Second)}, 60, true},
		{"seek back while playing", Device{Playing: true, Position: 30, reportedAt: time.Now().Add(-time.Second)}, 5, true},
		{"paused device does not drift", Device{Playing: false, Position: 30, reportedAt: time.Now().Add(-time.Minute)}, 30, false},
		{"seek while paused", Device{Playing: false, Position: 30, reportedAt: time.Now().Add(-time.Minute)}, 90, true},
		{"never reported", Device{Playing: true, Position: 0}, 0, false},
	}
	for _, c := range cases {
		if got := positionJumped(c.device, c.position); got != c.want {
			t.Errorf("%s: positionJumped = %v, want %v", c.name, got, c.want)
		}
	}
}

// The last seconds of a track are the ones that decide when the queue moves on;
// the rest are not worth a SOAP call every second.
func TestPollDelay(t *testing.T) {
	cases := []struct {
		name      string
		playing   bool
		remaining float64
		want      time.Duration
	}{
		{"mid track", true, 120, speakerPollInterval},
		{"about to end", true, 4, speakerEndingInterval},
		{"paused near the end", false, 4, speakerPollInterval},
		{"duration unknown", true, 0, speakerPollInterval},
		{"past the declared end", true, -3, speakerPollInterval},
	}
	for _, c := range cases {
		if got := pollDelay(c.playing, c.remaining); got != c.want {
			t.Errorf("%s: pollDelay(%v, %v) = %v, want %v", c.name, c.playing, c.remaining, got, c.want)
		}
	}
}

// A speaker outlives the server that told it what to play, so the URL it still
// holds is the only way back to which track that was.
func TestTrackFromStreamURL(t *testing.T) {
	cases := map[string]string{
		"http://192.168.1.2:8090/api/tracks/abc123/stream?token=x&transcode=mp3": "abc123",
		"http://192.168.1.2:8090/api/tracks/abc123/stream":                       "abc123",
		// Another thing about a track is not the track it is playing.
		"http://192.168.1.2:8090/api/tracks/abc123/peaks": "",
		// Anything the speaker plays on its own names no track of ours.
		"x-sonos-htastream:RINCON_1234:spdif": "",
		"http://radio.example.com/stream.mp3": "",
		"":                                    "",
	}
	for uri, want := range cases {
		if got := trackFromStreamURL(uri); got != want {
			t.Errorf("trackFromStreamURL(%q) = %q, want %q", uri, got, want)
		}
	}
}

// Discovery runs every ten seconds and knows nothing about playback: folding it
// in must leave alone what the speaker reported separately, or the registry
// forgets what is playing between two rounds.
func TestRefreshSpeakerKeepsPlayback(t *testing.T) {
	known := Device{
		ID: "192-168-0-9", Name: "Salon", Type: "sonos", Status: "playing",
		IPAddress: "192.168.0.9", Volume: 20, IsActive: true,
		Playing: true, TrackID: "abc123", Position: 42,
	}

	got := refreshSpeaker(known, players.Found{Address: "192.168.0.9", Name: "Salle TV", ID: "uuid:RINCON_1"}, "sonos", 25, true)

	if !got.Playing || got.TrackID != "abc123" || got.Position != 42 {
		t.Errorf("playback lost: playing=%v track=%q position=%v", got.Playing, got.TrackID, got.Position)
	}
	if got.Status != "playing" || !got.IsActive {
		t.Errorf("status lost: status=%q active=%v", got.Status, got.IsActive)
	}
	if got.Name != "Salle TV" || got.Volume != 25 {
		t.Errorf("discovery not applied: name=%q volume=%d", got.Name, got.Volume)
	}
}

func TestRefreshSpeakerAddsUnknown(t *testing.T) {
	got := refreshSpeaker(Device{}, players.Found{Address: "192.168.0.9", Name: "Salon"}, "sonos", 10, true)

	if got.ID != "192-168-0-9" || got.Type != "sonos" || got.Status != "available" {
		t.Errorf("unexpected new speaker: %+v", got)
	}
}
