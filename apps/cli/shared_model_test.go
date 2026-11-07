package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestPlayTracksSelectsOnlyCLIAndStartsSelectedTrackFirst(t *testing.T) {
	var paths []string
	var played []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		switch r.URL.Path {
		case "/api/player/devices":
			var body struct {
				DeviceIDs []string `json:"deviceIds"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if !reflect.DeepEqual(body.DeviceIDs, []string{"cli"}) {
				t.Errorf("selected devices = %v, want only the CLI", body.DeviceIDs)
			}
			_ = json.NewEncoder(w).Encode(sharedState{Devices: []string{"cli"}})
		case "/api/player/play":
			var body struct {
				Tracks []string `json:"tracks"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			played = body.Tracks
			_ = json.NewEncoder(w).Encode(sharedState{Track: played[0], Playing: true, Devices: []string{"cli"}, List: played})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	tracks := []libraryTrack{{track: track{ID: "a"}}, {track: track{ID: "b"}}, {track: track{ID: "c"}}}
	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		library: &Library{Tracks: tracks},
	}
	cmd := m.playTracks(tracks, 1)
	if cmd == nil {
		t.Fatal("selection produced no shared order")
	}
	event, ok := cmd().(sharedEvent)
	if !ok || event.err != nil {
		t.Fatalf("unexpected play result: %#v", event)
	}
	m.Update(event)
	if !reflect.DeepEqual(paths, []string{"/api/player/devices", "/api/player/play"}) {
		t.Fatalf("orders = %v, want exclusive device selection then play", paths)
	}
	if !reflect.DeepEqual(played, []string{"b", "c", "a"}) {
		t.Fatalf("queue = %v, want selected track first", played)
	}
	if m.shared.Track != "b" || m.playingIndex != 0 || len(m.queue) != 3 {
		t.Fatalf("shared play response not applied: %+v", m.shared)
	}
}

func TestResumeSharedSelectsOnlyFreshCLIFirst(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		_ = json.NewEncoder(w).Encode(sharedState{Track: "track", Playing: true, Devices: []string{"cli"}, List: []string{"track"}})
	}))
	defer server.Close()

	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared: sharedState{Track: "track", Playing: false},
	}
	cmd := m.resumeShared()
	if cmd == nil {
		t.Fatal("resume produced no shared order")
	}
	event, ok := cmd().(sharedEvent)
	if !ok || event.err != nil {
		t.Fatalf("unexpected resume result: %#v", event)
	}
	if !reflect.DeepEqual(paths, []string{"/api/player/devices", "/api/player/resume"}) {
		t.Fatalf("orders = %v, want exclusive device selection then resume", paths)
	}
}

func TestQuitLeavesSelectedDeviceBeforeExiting(t *testing.T) {
	left := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/leave" {
			http.NotFound(w, r)
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		left = body["deviceId"] == "cli"
		_ = json.NewEncoder(w).Encode(sharedState{Devices: []string{}})
	}))
	defer server.Close()

	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared: sharedState{Track: "track", Playing: true, Devices: []string{"cli"}},
	}
	msg := m.quit()()
	if _, ok := msg.(tea.QuitMsg); !ok {
		t.Fatalf("quit command returned %T, want tea.QuitMsg", msg)
	}
	if !left {
		t.Fatal("quit did not leave the selected device")
	}
}

func TestRendererFailureLeavesSharedPlayback(t *testing.T) {
	left := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/leave" {
			http.NotFound(w, r)
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		left = body["deviceId"] == "cli"
		_ = json.NewEncoder(w).Encode(sharedState{Devices: []string{}})
	}))
	defer server.Close()

	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli", playing: true,
		shared: sharedState{Track: "track", Playing: true, Devices: []string{"cli"}},
	}
	_, cmd := m.Update(trackFinished{generation: m.generation, err: errors.New("renderer unavailable")})
	if m.playing || cmd == nil {
		t.Fatal("renderer failure must stop locally and produce a leave order")
	}
	result, ok := cmd().(sharedEvent)
	if !ok || result.err != nil {
		t.Fatalf("leave result = %#v", result)
	}
	m.Update(result)
	if !left {
		t.Fatal("renderer failure did not remove the CLI from shared playback")
	}
}

func TestSelectingCurrentTrackTogglesPause(t *testing.T) {
	for _, tc := range []struct {
		playing bool
		action  string
	}{{true, "pause"}, {false, "resume"}} {
		t.Run(tc.action, func(t *testing.T) {
			var path string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				path = r.URL.Path
				_ = json.NewEncoder(w).Encode(sharedState{Track: "song", Playing: tc.playing, Devices: []string{"cli"}})
			}))
			defer server.Close()
			m := &playerModel{
				client: newClient(&Session{Server: server.URL}), deviceID: "cli",
				shared: sharedState{Track: "song", Playing: tc.playing, Devices: []string{"cli"}},
			}
			cmd := m.playTracks([]libraryTrack{{track: track{ID: "song"}}}, 0)
			event, ok := cmd().(sharedEvent)
			if !ok || event.err != nil {
				t.Fatalf("unexpected toggle result: %#v", event)
			}
			if path != "/api/player/"+tc.action {
				t.Fatalf("selecting current track called %s, want %s", path, tc.action)
			}
		})
	}
}

func TestSeekKeyRepeatSendsOnlyFinalPosition(t *testing.T) {
	var positions []float64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/seek" {
			http.NotFound(w, r)
			return
		}
		var body struct {
			Position float64 `json:"position"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		positions = append(positions, body.Position)
		_ = json.NewEncoder(w).Encode(sharedState{Track: "track", Playing: true, Devices: []string{"cli"}, Position: body.Position})
	}))
	defer server.Close()

	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared: sharedState{Track: "track", Playing: true, Devices: []string{"cli"}},
		queue:  []libraryTrack{{track: track{ID: "track", Duration: 120}}}, position: 30,
	}
	for range 2 {
		_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(".")})
		if cmd == nil {
			t.Fatal("forward seek produced no command")
		}
	}
	if m.position != 40 {
		t.Fatalf("optimistic position = %v, want 40", m.position)
	}
	_, stale := m.Update(seekSettled{generation: m.seekGeneration - 1, track: "track"})
	if stale != nil {
		t.Fatal("an obsolete seek repeat sent an order")
	}
	_, cmd := m.Update(seekSettled{generation: m.seekGeneration, track: "track"})
	m.Update(cmd())
	if !reflect.DeepEqual(positions, []float64{40}) {
		t.Fatalf("seek positions = %v, want only the final position", positions)
	}
}

func TestTrackKeyRepeatProducesOneOrder(t *testing.T) {
	for _, tc := range []struct{ key, action string }{{"n", "next"}, {"p", "previous"}} {
		t.Run(tc.action, func(t *testing.T) {
			orders := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/player/"+tc.action {
					http.NotFound(w, r)
					return
				}
				orders++
				_ = json.NewEncoder(w).Encode(sharedState{Track: tc.action, Playing: true})
			}))
			defer server.Close()

			m := &playerModel{
				client: newClient(&Session{Server: server.URL}),
				shared: sharedState{Track: "track", Playing: true},
			}
			m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tc.key)})
			m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tc.key)})
			_, stale := m.Update(trackSettled{generation: m.trackGeneration - 1, action: tc.action})
			if stale != nil {
				t.Fatal("an obsolete track-key repeat sent an order")
			}
			_, cmd := m.Update(trackSettled{generation: m.trackGeneration, action: tc.action})
			m.Update(cmd())
			if orders != 1 {
				t.Fatalf("held %s produced %d orders, want 1", tc.key, orders)
			}
		})
	}
}

func TestSharedPlayCommandUsesPositionAndCycle(t *testing.T) {
	for _, action := range []string{"play", "resume"} {
		t.Run(action, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			m := &playerModel{
				ctx: ctx, client: newClient(&Session{Server: "http://127.0.0.1"}), deviceID: "cli",
				queue: []libraryTrack{{track: track{ID: "track", Title: "Song"}}},
			}
			m.handleSharedEvent(sharedEvent{
				kind: sharedCommand, deviceID: "cli", action: action + ":track:12.500:0:99",
			})
			m.workers.Wait()
			if m.position != 12.5 || m.currentCycle != 99 || !m.playing || m.playingIndex != 0 {
				t.Fatalf("play command not applied: position %v cycle %d playing %v index %d", m.position, m.currentCycle, m.playing, m.playingIndex)
			}
		})
	}
}
