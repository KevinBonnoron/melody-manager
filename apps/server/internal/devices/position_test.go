package devices

import (
	"testing"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// Drift is what a playing device accumulates on its own; a seek is what lands away from where
// it was heading.
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

// The last seconds of a track are the ones that decide when the queue moves on.
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

// A speaker outlives the server that told it what to play, so the URL it still holds is the
// only way back to which track that was.
func TestTrackFromStreamURL(t *testing.T) {
	cases := map[string]string{
		"http://192.168.1.2:8090/api/tracks/abc123/stream?token=x&transcode=mp3": "abc123",
		"http://192.168.1.2:8090/api/tracks/abc123/stream":                       "abc123",
		"http://192.168.1.2:8090/api/tracks/abc123/peaks":                        "",
		"x-sonos-htastream:RINCON_1234:spdif":                                    "",
		"http://radio.example.com/stream.mp3":                                    "",
		"":                                                                       "",
	}
	for uri, want := range cases {
		if got := trackFromStreamURL(uri); got != want {
			t.Errorf("trackFromStreamURL(%q) = %q, want %q", uri, got, want)
		}
	}
}

// Discovery runs every ten seconds and knows nothing about playback.
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

type positionReport struct {
	owner, track string
	position     float64
	cycle        int64
}

type positionRecorder struct {
	reports []positionReport
}

func (r *positionRecorder) SavePosition(owner, track string, position float64, cycle int64) error {
	r.reports = append(r.reports, positionReport{owner, track, position, cycle})
	return nil
}

func (*positionRecorder) Finished(string, string, int64) error { return nil }

func TestPollSpeakerTreatsOnlyPlayingAsActive(t *testing.T) {
	for _, state := range []string{"PLAYING", "TRANSITIONING", "BUFFERING", "PAUSED_PLAYBACK", "STOPPED", "UNKNOWN"} {
		t.Run(state, func(t *testing.T) {
			service := New(func() string { return "" })
			service.devices["speaker"] = Device{ID: "speaker", Type: "stub"}
			service.SetPlayers(players.Registry{"stub": stubPlayer{state: state}})
			sample, _, ok := service.pollSpeaker("speaker")
			if !ok {
				t.Fatal("speaker disappeared")
			}
			if got, want := sample.Playing, state == "PLAYING"; got != want {
				t.Fatalf("playing = %v for transport %q, want %v", got, state, want)
			}
		})
	}
}

func TestSpeakerPollKeepsTheRunCapturedBeforeNetworkIO(t *testing.T) {
	service := New(func() string { return "" })
	recorder := &positionRecorder{}
	service.SetPlaybackStore(recorder)
	service.devices["speaker"] = Device{ID: "speaker", Type: "stub", TrackID: "a", Position: 20, owner: "u1", cycle: 101}
	speaker := stubPlayer{onVolume: func() {
		service.SetSpeakerTrack("speaker", "u1", "a", 102)
	}}
	service.SetPlayers(players.Registry{"stub": speaker})

	sample, _, ok := service.pollSpeaker("speaker")
	if !ok {
		t.Fatal("speaker disappeared")
	}
	service.saveSpeakerPosition(sample)
	if len(recorder.reports) != 1 || recorder.reports[0] != (positionReport{"u1", "a", 0, 101}) {
		t.Fatalf("report was relabelled: %+v", recorder.reports)
	}
	if got := service.devices["speaker"]; got.cycle != 102 || got.Position != 20 {
		t.Fatalf("old poll replaced the new run: %+v", got)
	}

	service.SetPlayers(players.Registry{"stub": stubPlayer{}})
	current, _, ok := service.pollSpeaker("speaker")
	if !ok {
		t.Fatal("speaker disappeared")
	}
	service.saveSpeakerPosition(current)
	if len(recorder.reports) != 2 || recorder.reports[1].cycle != 102 {
		t.Fatalf("current run was not reported: %+v", recorder.reports)
	}
}

func TestSpeakerDoesNotReportAnUnidentifiedRun(t *testing.T) {
	service := New(func() string { return "" })
	recorder := &positionRecorder{}
	service.SetPlaybackStore(recorder)
	service.saveSpeakerPosition(Device{ID: "speaker", owner: "u1", TrackID: "a", Position: 42})
	if len(recorder.reports) != 0 {
		t.Fatalf("unidentified report: %+v", recorder.reports)
	}
}
