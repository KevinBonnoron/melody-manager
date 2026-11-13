package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
)

func TestSharedTrackChangeLeavesLibraryCursorInPlace(t *testing.T) {
	tracks := make([]libraryTrack, 8)
	ids := make([]string, len(tracks))
	for i := range tracks {
		tracks[i] = libraryTrack{track: track{ID: string(rune('a' + i)), Title: string(rune('A' + i))}}
		ids[i] = tracks[i].ID
	}
	m := &playerModel{
		library: &Library{Tracks: tracks, Albums: []LibraryAlbum{{Tracks: tracks}}}, filtered: []int{0},
		width: 80, height: 9, detail: true, trackIndex: 1,
	}
	m.applySharedState(sharedState{Track: "f", List: ids, Playing: true})
	if m.trackIndex != 1 || m.trackOffset != 0 {
		t.Fatalf("playback moved the library cursor: index %d offset %d", m.trackIndex, m.trackOffset)
	}
	if m.playingIndex != 5 || !m.playing || m.paused {
		t.Fatalf("shared state was not applied: index %d playing %v paused %v", m.playingIndex, m.playing, m.paused)
	}
}

func TestInitialSharedStateShowsPausedPositionAfterLibraryLoads(t *testing.T) {
	m := &playerModel{}
	m.applySharedState(sharedState{Track: "track", Position: 65, List: []string{"track"}, Playing: false})
	m.Update(libraryLoaded{library: &Library{
		Tracks: []libraryTrack{{track: track{ID: "track", Title: "Song", Duration: 174}}},
	}})
	m.generation = 1
	m.Update(playbackUpdate{generation: 1, event: PlaybackEvent{Position: 0, Paused: true, Ready: false}})
	if m.position != 65 {
		t.Fatalf("renderer loading event reset the server position to %v", m.position)
	}
	view := ansi.Strip(m.playerView(100, newUIPalette()))
	if !strings.Contains(view, "PAUSED") || strings.Contains(view, "LOADING") {
		t.Fatalf("initial paused track has wrong state: %q", view)
	}
	if !strings.Contains(view, "1:05 / 2:54") {
		t.Fatalf("server position not shown before local renderer starts: %q", view)
	}
	if want := 65.0 / 174; m.progressTarget != want {
		t.Fatalf("progress target = %v, want %v", m.progressTarget, want)
	}
}

func TestRemotePlaybackAdvancesBetweenServerUpdates(t *testing.T) {
	now := time.Now()
	m := &playerModel{}
	m.applySharedState(sharedState{
		Track: "track", Position: 20, PositionAt: sharedTime{Time: now}, Now: sharedTime{Time: now},
		List: []string{"track"}, Playing: true,
	})
	m.Update(libraryLoaded{library: &Library{
		Tracks: []libraryTrack{{track: track{ID: "track", Title: "Song", Duration: 100}}},
	}})
	m.shared.PositionAt = sharedTime{Time: time.Now().Add(-2 * time.Second)}
	m.serverOffset = 0
	_, cmd := m.Update(spinner.TickMsg{})
	if m.position < 22 {
		t.Fatalf("remote position = %v, want at least 22", m.position)
	}
	if m.progressTarget < 0.22 || cmd == nil {
		t.Fatalf("remote progress was not advanced: target=%v command=%v", m.progressTarget, cmd)
	}
}

// A run no device has started yet holds still on the server, so the terminal
// must not count it on: reconciling from a counted-on position would start the
// track past audio nobody has heard.
func TestRemotePlaybackStillLoadingDoesNotAdvance(t *testing.T) {
	before := time.Now().Add(-5 * time.Second)
	m := &playerModel{}
	m.applySharedState(sharedState{
		Track: "track", Position: 90, PositionAt: sharedTime{Time: before}, Now: sharedTime{Time: time.Now()},
		List: []string{"track"}, Playing: true, Waiting: true,
	})
	if m.position != 90 {
		t.Fatalf("position of a waiting run = %v, want 90", m.position)
	}
	m.Update(libraryLoaded{library: &Library{
		Tracks: []libraryTrack{{track: track{ID: "track", Title: "Song", Duration: 200}}},
	}})
	m.Update(spinner.TickMsg{})
	if m.position != 90 {
		t.Fatalf("position of a waiting run after a tick = %v, want 90", m.position)
	}
}

func TestPlayerControlsAndProgress(t *testing.T) {
	state := sharedState{Track: "a", Playing: true, Devices: []string{"cli"}, List: []string{"a"}, Repeat: "none"}
	var orders []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		orders = append(orders, r.URL.Path)
		switch r.URL.Path {
		case "/api/player/pause":
			state.Playing = false
		case "/api/player/resume":
			state.Playing = true
		case "/api/player/repeat":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			state.Repeat = body["repeat"]
		default:
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(state)
	}))
	defer server.Close()

	m := &playerModel{
		width: 80, height: 20, playing: true, playingIndex: 0,
		client: newClient(&Session{Server: server.URL}), shared: state, deviceID: "cli",
		queue:  []libraryTrack{{track: track{ID: "a", Title: "Song", Duration: 120}}},
		events: make(chan PlaybackEvent, 1), done: make(chan error, 1), generation: 2,
	}
	if view := m.View(); !strings.Contains(view, "LOADING") || !strings.Contains(view, "Song") || !strings.Contains(view, "0:00 / 2:00") {
		t.Fatalf("loading state must not invent a position: %q", view)
	}
	for _, playing := range []bool{false, true} {
		_, cmd := m.Update(tea.KeyMsg{Type: tea.KeySpace})
		if cmd == nil {
			t.Fatal("space did not send a shared transport order")
		}
		m.Update(cmd())
		if m.shared.Playing != playing {
			t.Fatalf("shared playing = %v, want %v", m.shared.Playing, playing)
		}
	}
	m.Update(playbackUpdate{generation: 1, event: PlaybackEvent{Position: 100, Ready: true}})
	if m.position != 0 || m.ready {
		t.Fatal("stale event changed the current track")
	}
	m.Update(playbackUpdate{generation: 2, event: PlaybackEvent{Position: 30, Ready: true, Paused: true}})
	view := m.View()
	if !strings.Contains(view, "PAUSED") || !strings.Contains(view, "Song") || !strings.Contains(view, "0:30 / 2:00") || !strings.Contains(view, "░") {
		t.Fatalf("missing state or progress in view: %q", view)
	}
	for _, tc := range []struct {
		mode repeatMode
		wire string
	}{{repeatAll, "all"}, {repeatOne, "one"}, {repeatOff, "none"}} {
		_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")})
		m.Update(cmd())
		if m.repeat != tc.mode || state.Repeat != tc.wire {
			t.Fatalf("repeat = %v and server %q, want %v and %q", m.repeat, state.Repeat, tc.mode, tc.wire)
		}
		label := "Repeat " + m.repeat.String()
		if view := m.View(); strings.Count(view, label) != 1 || strings.Contains(view, "r:"+m.repeat.String()) {
			t.Fatalf("repeat mode %v must have one explicit label: %q", m.repeat, view)
		}
	}
	if strings.Join(orders, ",") != "/api/player/pause,/api/player/resume,/api/player/repeat,/api/player/repeat,/api/player/repeat" {
		t.Fatalf("unexpected shared orders: %v", orders)
	}
}

func TestSelectionWrapsAtBothEnds(t *testing.T) {
	m := &playerModel{
		library: &Library{Albums: []LibraryAlbum{
			{Tracks: []libraryTrack{{}, {}}},
			{Tracks: []libraryTrack{{}, {}}},
		}},
		filtered: []int{0, 1},
	}

	m.Update(tea.KeyMsg{Type: tea.KeyUp})
	if m.albumIndex != 1 {
		t.Fatalf("up at the first album selected %d, want the last", m.albumIndex)
	}
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	if m.albumIndex != 0 {
		t.Fatalf("down at the last album selected %d, want the first", m.albumIndex)
	}

	m.detail = true
	m.Update(tea.KeyMsg{Type: tea.KeyUp})
	if m.trackIndex != 1 {
		t.Fatalf("up at the first track selected %d, want the last", m.trackIndex)
	}
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	if m.trackIndex != 0 {
		t.Fatalf("down at the last track selected %d, want the first", m.trackIndex)
	}

	m.detail = false
	m.searching = true
	m.Update(tea.KeyMsg{Type: tea.KeyUp})
	if m.albumIndex != 1 {
		t.Fatalf("up at the first result selected %d, want the last", m.albumIndex)
	}
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	if m.albumIndex != 0 {
		t.Fatalf("down at the last result selected %d, want the first", m.albumIndex)
	}
}

func TestHorizontalNavigationAliases(t *testing.T) {
	m := &playerModel{
		library:  &Library{Albums: []LibraryAlbum{{Tracks: []libraryTrack{{}}}}},
		filtered: []int{0},
	}
	for _, key := range []tea.KeyMsg{{Type: tea.KeyRight}, {Type: tea.KeyRunes, Runes: []rune("l")}} {
		m.detail = false
		m.Update(key)
		if !m.detail {
			t.Fatalf("%q did not open the selected album like l", key.String())
		}
	}
	for _, key := range []tea.KeyMsg{{Type: tea.KeyLeft}, {Type: tea.KeyRunes, Runes: []rune("h")}} {
		m.detail = true
		m.Update(key)
		if m.detail {
			t.Fatalf("%q did not close the album like h", key.String())
		}
	}
}

func TestPlayerItemsAlignArtistsAndTruncateLongTitles(t *testing.T) {
	palette := newUIPalette()
	short := ansi.Strip(renderPlayerItem(playerItem{kind: "TRACK", title: "Short", meta: "Artist"}, false, 80, palette))
	long := ansi.Strip(renderPlayerItem(playerItem{kind: "TRACK", title: strings.Repeat("A very long title ", 8), meta: "Artist"}, false, 80, palette))

	shortArtist := strings.Index(short, "Artist")
	longArtist := strings.Index(long, "Artist")
	if shortArtist < 0 || longArtist < 0 || ansi.StringWidth(short[:shortArtist]) != ansi.StringWidth(long[:longArtist]) {
		t.Fatalf("artist columns differ: short %d, long %d\nshort: %q\nlong: %q", shortArtist, longArtist, short, long)
	}
	if !strings.Contains(long, "…") || ansi.StringWidth(long) > 80 {
		t.Fatalf("long title was not truncated to its column: %q", long)
	}
}

func TestNaturalCompletionReportsTrackAndCycle(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/ended" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		_ = json.NewEncoder(w).Encode(sharedState{Track: "b", Playing: true, List: []string{"a", "b"}})
	}))
	defer server.Close()
	m := &playerModel{
		client:  newClient(&Session{Server: server.URL}),
		queue:   []libraryTrack{{track: track{ID: "a"}}, {track: track{ID: "b"}}},
		playing: true, playingIndex: 0, generation: 1, currentCycle: 42, cancelTrack: func() {},
	}
	_, cmd := m.Update(trackFinished{generation: 1})
	if cmd == nil {
		t.Fatal("natural completion did not notify the server")
	}
	m.Update(cmd())
	if body["trackId"] != "a" || body["cycle"] != float64(42) {
		t.Fatalf("unexpected completion report: %+v", body)
	}
	if m.shared.Track != "b" || !m.shared.Playing {
		t.Fatalf("server completion state was not applied: %+v", m.shared)
	}
}

func TestStopLeavesSharedPlaybackAndUnknownDuration(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/leave" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(sharedState{Track: "a", Devices: []string{}})
	}))
	defer server.Close()
	canceled := false
	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared: sharedState{Track: "a", Devices: []string{"cli"}},
		width:  40, height: 12, playing: true, ready: true,
		queue:    []libraryTrack{{track: track{ID: "a", Title: "Song"}}},
		position: 10, repeat: repeatOne, generation: 5,
		cancelTrack: func() { canceled = true },
	}
	if !strings.Contains(m.View(), "0:10 / --:--") {
		t.Fatal("unknown duration must not be invented")
	}
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("s")})
	if cmd == nil {
		t.Fatal("stop did not leave shared playback")
	}
	m.Update(cmd())
	if !canceled || m.playing {
		t.Fatal("leaving shared playback must stop the local renderer")
	}
	m.Update(trackFinished{generation: 4})
	if m.playing {
		t.Fatal("stale completion restarted local playback")
	}
}

func TestSearchFromTrackViewKeepsPlayback(t *testing.T) {
	tracks := []libraryTrack{{track: track{ID: "a", Title: "Blue Song"}}}
	m := &playerModel{
		library: &Library{Tracks: tracks, Albums: []LibraryAlbum{
			{Album: album{Name: "Blue Album"}, Tracks: tracks},
		}},
		filtered: []int{0}, detail: true, playing: true,
		queue: tracks, cancelTrack: func() { t.Error("search canceled playback") },
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	if m.detail || !m.searching || !m.playing {
		t.Fatal("search must open globally without stopping playback")
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Blue")})
	if len(m.filtered) != 2 || len(m.filteredTracks) != 1 {
		t.Fatalf("search must find tracks and albums: %+v", m.filtered)
	}
	if m.albumIndex != 0 || m.filtered[0] < 0 {
		t.Fatal("matching albums must appear before tracks")
	}
	m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if m.searching || !m.detail || m.selectedAlbum() == nil || !m.playing {
		t.Fatal("enter must open the selected result without stopping playback")
	}
}

func TestValidatedSearchDoesNotReplaceHome(t *testing.T) {
	tracks := []libraryTrack{{track: track{ID: "song", Title: "Blue Song"}}}
	m := &playerModel{
		library:  &Library{Tracks: tracks, Albums: []LibraryAlbum{{Album: album{ID: "album", Name: "Blue Album"}, Tracks: tracks}}},
		filtered: []int{-1, 0}, width: 100, height: 30,
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Blue")})
	m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if !m.detail || m.selectedAlbum() == nil {
		t.Fatal("validating an album must open it")
	}
	m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if m.detail || m.searchResults || m.query != "" || len(m.filtered) != 2 || m.filtered[0] != -1 {
		t.Fatal("escape must restore the untouched home screen")
	}
	if view := m.View(); strings.Contains(view, "Search results") {
		t.Fatal("search results must remain inside the modal")
	}
}

func TestSearchModalRestoresPreviousScreen(t *testing.T) {
	tracks := []libraryTrack{{track: track{ID: "a", Title: "Blue Song", Duration: 30}}}
	m := &playerModel{
		library:  &Library{Tracks: tracks, Albums: []LibraryAlbum{{Album: album{ID: "album", Name: "Blue Album"}, Tracks: tracks}}},
		filtered: []int{0}, detail: true, trackIndex: 0, width: 80, height: 30,
		playing: true, ready: true, paused: true, queue: tracks,
		query: "previous",
	}
	before := m.View()
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	if !m.searching || m.query != "" {
		t.Fatal("opening search must show a fresh modal")
	}
	modal := m.View()
	if strings.Count(before, "\n") != strings.Count(modal, "\n") {
		t.Fatal("opening the modal changed the terminal layout")
	}
	for _, line := range strings.Split(modal, "\n") {
		if ansi.StringWidth(line) > m.width {
			t.Fatalf("modal line exceeds terminal width: %q", line)
		}
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("nobody")})
	m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if after := m.View(); after != before {
		t.Fatalf("escape did not restore the previous screen\nbefore: %q\nafter: %q", before, after)
	}
}

func TestSearchTreatsUppercaseRatingLettersAsText(t *testing.T) {
	tracks := []libraryTrack{{track: track{ID: "song", Title: "Daft Punk"}}}
	m := &playerModel{
		library: &Library{Tracks: tracks}, filteredTracks: tracks, filtered: []int{-2},
		searching: true, ratingPending: make(map[string]bool),
	}
	for _, letter := range []rune{'F', 'D'} {
		m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{letter}})
	}
	if m.query != "FD" {
		t.Fatalf("search query = %q, want FD", m.query)
	}
	if len(m.ratingPending) != 0 {
		t.Fatalf("typing in search started rating requests: %v", m.ratingPending)
	}
}

func TestSearchShowsAndPlaysTracksDirectly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/play" {
			http.NotFound(w, r)
			return
		}
		var body map[string][]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(body["tracks"]) != 1 || body["tracks"][0] != "song" {
			t.Errorf("unexpected shared queue: %+v", body)
		}
		_ = json.NewEncoder(w).Encode(sharedState{Track: "song", Playing: true, List: body["tracks"]})
	}))
	defer server.Close()
	tracks := []libraryTrack{{track: track{ID: "song", Title: "Blue Song"}, artist: "Singer", album: "Blue Album"}}
	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared:  sharedState{Devices: []string{"cli"}},
		library: &Library{Tracks: tracks, Albums: []LibraryAlbum{{Album: album{Name: "Blue Album"}}}},
		width:   100, height: 20,
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Blue")})
	view := m.View()
	for _, text := range []string{"TRACK", "Blue Song", "Singer", "Blue Album", "ALBUM"} {
		if !strings.Contains(view, text) {
			t.Fatalf("search results missing %q: %q", text, view)
		}
	}
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter did not start shared playback")
	}
	m.Update(cmd())
	if m.detail || !m.playing || m.playingIndex != 0 || len(m.queue) != 1 || m.queue[0].ID != "song" {
		t.Fatal("enter must play the selected track directly")
	}
}

func TestRightPlaysSearchResultWithoutClosingModal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/player/play" {
			http.NotFound(w, r)
			return
		}
		var body map[string][]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		_ = json.NewEncoder(w).Encode(sharedState{Track: "song", Playing: true, Devices: []string{"cli"}, List: body["tracks"]})
	}))
	defer server.Close()
	tracks := []libraryTrack{{track: track{ID: "song", Title: "Blue Song"}, artist: "Singer", album: "Blue Album"}}
	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared:  sharedState{Devices: []string{"cli"}},
		library: &Library{Tracks: tracks, Albums: []LibraryAlbum{{Album: album{Name: "Blue Album"}}}},
		width:   100, height: 20,
	}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Blue")})
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRight})
	m.Update(cmd())
	if !m.searching || m.query != "Blue" || !m.playing {
		t.Fatalf("right must play without closing search: searching=%v query=%q playing=%v", m.searching, m.query, m.playing)
	}
}

func TestConfirmedSearchKeepsResultHeading(t *testing.T) {
	m := &playerModel{
		searchResults: true, filtered: []int{0},
		library: &Library{Albums: make([]LibraryAlbum, 4), Tracks: make([]libraryTrack, 9)},
	}
	header := ansi.Strip(strings.Join(m.headerView(100, newUIPalette()), "\n"))
	if !strings.Contains(header, "Search results") || !strings.Contains(header, "1 albums and tracks") {
		t.Fatalf("confirmed search heading is wrong: %q", header)
	}
	if strings.Contains(header, "Your library") || strings.Contains(header, "4 albums") {
		t.Fatalf("confirmed search shows full-library heading: %q", header)
	}
}

func TestIdlePlayerDoesNotShowPauseIndicator(t *testing.T) {
	m := &playerModel{width: 100, height: 20, paused: true}
	if view := ansi.Strip(m.View()); strings.Contains(view, "II") {
		t.Fatalf("idle player shows pause indicator: %q", view)
	}
	m.playing = true
	m.queue = []libraryTrack{{track: track{ID: "song", Title: "Song"}}}
	m.playingIndex = 0
	if view := ansi.Strip(m.View()); !strings.Contains(view, "II") {
		t.Fatalf("paused track does not show pause indicator: %q", view)
	}
}

func TestLongSearchKeepsTrailingQueryAndCursorVisible(t *testing.T) {
	m := &playerModel{query: "start-" + strings.Repeat("x", 80) + "-end"}
	view := ansi.Strip(m.searchView(30, newUIPalette()))
	if !strings.Contains(view, "-end█") {
		t.Fatalf("long search hid its trailing query or cursor: %q", view)
	}
	if ansi.StringWidth(view) > 30 {
		t.Fatalf("search row exceeds terminal width: %q", view)
	}
}

func TestPlayerColorsAndWidth(t *testing.T) {
	t.Setenv("TERM", "xterm")
	t.Setenv("NO_COLOR", "")
	m := &playerModel{width: 30, height: 14}
	if view := m.View(); strings.Contains(view, "\x1b[38;") || strings.Contains(view, "\x1b[48;") {
		t.Fatalf("NO_COLOR must suppress colors: %q", view)
	}
	if err := os.Unsetenv("NO_COLOR"); err != nil {
		t.Fatal(err)
	}
	previousProfile := lipgloss.ColorProfile()
	lipgloss.SetColorProfile(termenv.TrueColor)
	t.Cleanup(func() { lipgloss.SetColorProfile(previousProfile) })
	view := m.View()
	if !strings.Contains(view, "\x1b[") {
		t.Fatal("expected ANSI colors on a capable terminal")
	}
	for _, line := range strings.Split(view, "\n") {
		if ansi.StringWidth(line) > m.width {
			t.Fatalf("line exceeds terminal width: %q", line)
		}
	}
	t.Setenv("TERM", "dumb")
	if view := m.View(); strings.Contains(view, "\x1b[38;") || strings.Contains(view, "\x1b[48;") {
		t.Fatalf("TERM=dumb must suppress colors: %q", view)
	}
}

func TestOrderResultDoesNotRearmRealtimeWatcher(t *testing.T) {
	events := make(chan sharedEvent, 2)
	events <- sharedEvent{kind: sharedCommand, action: "first"}
	events <- sharedEvent{kind: sharedCommand, action: "second"}
	m := &playerModel{ctx: context.Background(), sharedEvents: events}
	m.Update(sharedEvent{kind: sharedFailed})

	wait := m.waitShared()
	if wait == nil {
		t.Fatal("realtime watcher is not armed")
	}
	if got := wait().(sharedStreamMsg).event.action; got != "first" {
		t.Fatalf("first realtime event = %q, want first", got)
	}
	if got := (<-events).action; got != "second" {
		t.Fatalf("remaining realtime event = %q, want second", got)
	}
}

func TestVisibleItemsMarksOnlyCurrentAlbum(t *testing.T) {
	m := &playerModel{
		library:  &Library{Albums: []LibraryAlbum{{Album: album{ID: "one", Name: "One"}}, {Album: album{ID: "two", Name: "Two"}}}},
		filtered: []int{0, 1}, playing: true,
		queue: []libraryTrack{{track: track{ID: "song", Album: "two"}}},
	}
	items := m.visibleItems()
	if items[0].playing || !items[1].playing {
		t.Fatalf("current album highlighting = %v, %v; want false, true", items[0].playing, items[1].playing)
	}
}

func TestQuitLeavesWithinTwoSeconds(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	defer server.Close()
	m := &playerModel{
		client: newClient(&Session{Server: server.URL}), deviceID: "cli",
		shared: sharedState{Devices: []string{"cli"}},
	}
	started := time.Now()
	msg := m.quit()()
	if _, ok := msg.(tea.QuitMsg); !ok {
		t.Fatalf("quit message = %T, want tea.QuitMsg", msg)
	}
	if elapsed := time.Since(started); elapsed > 4*time.Second {
		t.Fatalf("quit took %s, want the two-second leave deadline", elapsed)
	}
}
