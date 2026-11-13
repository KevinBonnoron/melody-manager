package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/muesli/termenv"
)

const usage = `Melody Manager terminal player

Usage:
  melody                 Browse and play your library
  melody login [server]  Configure the server and sign in
  melody logout          Remove the saved session
  melody help            Show this help

Browse albums with the arrow keys or h/j/k/l, and press Enter to open one.
Use / to open a fresh search modal; Enter opens an album or plays a track.
Right plays the search selection without closing the modal.
On a selected track, f toggles like and d toggles dislike.
Press ? for the complete keyboard shortcut panel.
During playback Space pauses or resumes, ,/. seek 5 seconds,
n/p select next/previous once (including when held), r cycles repeat,
s leaves shared playback, and q quits without pressing Enter.
Playback is shared with the web player; this terminal appears as a device.
`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdin, os.Stdout); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintln(os.Stderr, "melody:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, input io.Reader, out io.Writer) error {
	in := bufio.NewReader(input)
	if len(args) > 0 {
		switch args[0] {
		case "help", "--help", "-h":
			fmt.Fprint(out, usage)
			return nil
		case "login":
			return login(in, out, args[1:])
		case "logout":
			if len(args) != 1 {
				return errors.New("usage: melody logout")
			}
			return logout(out)
		default:
			return fmt.Errorf("unknown command %q; run melody help", args[0])
		}
	}

	session, err := loadSession()
	if errors.Is(err, errNotLoggedIn) {
		fmt.Fprintln(out, "Configure your server to start listening.")
		if err := login(in, out, nil); err != nil {
			return err
		}
		session, err = loadSession()
	}
	if err != nil {
		return err
	}
	return browse(ctx, newClient(session), input, out)
}

type libraryTrack struct {
	track
	artist string
	album  string
}

type libraryLoaded struct {
	library *Library
	err     error
}
type ratingsLoaded struct {
	ratings map[string]trackRating
	err     error
}
type ratingSaved struct {
	trackID string
	rating  trackRating
	err     error
}
type coverLoaded struct {
	id    string
	rows  int
	lines []string
	err   error
}
type trackFinished struct {
	generation uint64
	err        error
}
type delayedControl struct {
	generation uint64
	paused     bool
}
type playbackUpdate struct {
	generation uint64
	event      PlaybackEvent
}
type trackSettled struct {
	generation uint64
	action     string
}
type seekSettled struct {
	generation uint64
	track      string
}

type repeatMode int

const (
	repeatOff repeatMode = iota
	repeatAll
	repeatOne
)

func (r repeatMode) String() string {
	switch r {
	case repeatAll:
		return "all"
	case repeatOne:
		return "one"
	default:
		return "off"
	}
}

type searchSnapshot struct {
	query                    string
	filtered                 []int
	filteredTracks           []libraryTrack
	detail, searchResults    bool
	albumIndex, trackIndex   int
	albumOffset, trackOffset int
}

type playerModel struct {
	ctx                      context.Context
	client                   *client
	deviceSession            string
	deviceName               string
	deviceID                 string
	shared                   sharedState
	sharedReady              bool
	needsReconcile           bool
	sharedEvents             chan sharedEvent
	serverOffset             time.Duration
	currentCycle             int64
	startPosition            float64
	startPaused              bool
	lastPositionReport       time.Time
	library                  *Library
	ratings                  map[string]trackRating
	ratingPending            map[string]bool
	loading                  bool
	width, height            int
	query                    string
	searching                bool
	searchResults            bool
	helpOpen                 bool
	searchReturn             searchSnapshot
	filtered                 []int // album index; -1 all tracks; -2-i filtered track i
	filteredTracks           []libraryTrack
	albumIndex, trackIndex   int
	albumOffset, trackOffset int
	detail                   bool
	cover                    []string
	coverID                  string
	coverRows                int
	coverErr                 string
	queue                    []libraryTrack
	playingIndex             int
	playing                  bool
	ready, paused            bool
	desiredPaused            bool
	position                 float64
	seekTarget               float64
	trackGeneration          uint64
	seekGeneration           uint64
	repeat                   repeatMode
	generation               uint64
	controls                 chan bool
	events                   chan PlaybackEvent
	done                     chan error
	cancelTrack              context.CancelFunc
	workers                  sync.WaitGroup
	status                   string
	spinner                  spinner.Model
	progress                 progress.Model
	componentsReady          bool
	animationRunning         bool
	animationFrame           int
	progressTarget           float64
}

func browse(ctx context.Context, c *client, input io.Reader, out io.Writer) error {
	identity := make([]byte, 16)
	if _, err := rand.Read(identity); err != nil {
		return err
	}
	playCtx, cancel := context.WithCancel(ctx)
	host, _ := os.Hostname()
	name := "Melody CLI"
	if host != "" {
		name += " · " + host
	}
	m := &playerModel{
		ctx: playCtx, client: c, loading: true,
		deviceSession: hex.EncodeToString(identity), deviceName: name,
		sharedEvents: make(chan sharedEvent, 16),
	}
	defer func() {
		cancel()
		m.workers.Wait()
	}()
	_, err := tea.NewProgram(m, tea.WithInput(input), tea.WithOutput(out), tea.WithAltScreen(), tea.WithContext(ctx)).Run()
	return err
}

func (m *playerModel) ensureComponents() {
	if m.componentsReady {
		return
	}
	m.spinner = spinner.New(spinner.WithSpinner(spinner.MiniDot))
	profile := termenv.TrueColor
	if !terminalColorEnabled() {
		profile = termenv.Ascii
	}
	m.progress = progress.New(
		progress.WithDefaultGradient(),
		progress.WithColorProfile(profile),
		progress.WithFillCharacters('█', '░'),
		progress.WithoutPercentage(),
	)
	m.progress.SetSpringOptions(12, 0.8)
	m.componentsReady = true
}

func (m *playerModel) animationActive() bool {
	return m.loading || m.searching || (m.playing && (!m.ready || !m.paused))
}

func (m *playerModel) startAnimation() tea.Cmd {
	m.ensureComponents()
	if m.animationRunning || !m.animationActive() {
		return nil
	}
	m.animationRunning = true
	return m.spinner.Tick
}

func (m *playerModel) Init() tea.Cmd {
	m.ensureComponents()
	m.workers.Add(2)
	go func() {
		defer m.workers.Done()
		watchDevicePresence(m.ctx, m.client, m.deviceSession, m.deviceName, m.sharedEvents)
	}()
	go func() {
		defer m.workers.Done()
		watchSharedState(m.ctx, m.client, m.sharedEvents)
	}()
	return tea.Batch(
		func() tea.Msg {
			library, err := loadLibrary(m.client)
			return libraryLoaded{library, err}
		},
		func() tea.Msg {
			ratings, err := loadTrackRatings(m.client)
			return ratingsLoaded{ratings: ratings, err: err}
		},
		m.waitShared(),
		m.startAnimation(),
	)
}

func (m *playerModel) waitShared() tea.Cmd {
	if m.sharedEvents == nil {
		return nil
	}
	return func() tea.Msg {
		select {
		case event := <-m.sharedEvents:
			return sharedStreamMsg{event: event}
		case <-m.ctx.Done():
			return nil
		}
	}
}

func (m *playerModel) serverNow() time.Time {
	return time.Now().Add(m.serverOffset)
}

func (m *playerModel) syncSharedQueue() {
	if m.library == nil {
		return
	}
	byID := make(map[string]libraryTrack, len(m.library.Tracks))
	for _, track := range m.library.Tracks {
		byID[track.ID] = track
	}
	queue := make([]libraryTrack, 0, len(m.shared.List)+1)
	for _, id := range m.shared.List {
		if track, ok := byID[id]; ok {
			queue = append(queue, track)
		}
	}
	current := -1
	for i, track := range queue {
		if track.ID == m.shared.Track {
			current = i
			break
		}
	}
	if current < 0 && m.shared.Track != "" {
		item, ok := byID[m.shared.Track]
		if !ok {
			item = libraryTrack{track: track{ID: m.shared.Track}}
		}
		queue = append(queue, item)
		current = len(queue) - 1
	}
	m.queue = queue
	if current >= 0 {
		m.playingIndex = current
	}
}

func (m *playerModel) syncProgressTarget() {
	m.progressTarget = 0
	if m.playingIndex >= 0 && m.playingIndex < len(m.queue) && m.queue[m.playingIndex].Duration > 0 {
		m.progressTarget = min(max(m.position/m.queue[m.playingIndex].Duration, 0), 1)
	}
}

func (m *playerModel) applySharedState(state sharedState) {
	previousTrack := m.shared.Track
	m.shared = state
	m.sharedReady = true
	if !state.Now.IsZero() {
		m.serverOffset = state.Now.Sub(time.Now())
	}
	switch state.Repeat {
	case "all":
		m.repeat = repeatAll
	case "one":
		m.repeat = repeatOne
	default:
		m.repeat = repeatOff
	}
	m.syncSharedQueue()
	m.playing = state.Track != ""
	m.paused = !state.Playing
	m.desiredPaused = m.paused
	if previousTrack != state.Track {
		m.ready = false
	}
	position := state.Position
	if state.Playing && !state.Waiting && !state.PositionAt.IsZero() {
		position += m.serverNow().Sub(state.PositionAt.Time).Seconds()
	}
	m.position = max(position, 0)
	if m.deviceID != "" && m.cancelTrack != nil && !containsString(state.Devices, m.deviceID) {
		m.stopLocal()
	}
	m.syncProgressTarget()
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func (m *playerModel) stopLocal() {
	m.generation++
	if m.cancelTrack != nil {
		m.cancelTrack()
		m.cancelTrack = nil
	}
	m.playing = false
	m.ready, m.paused, m.position = false, false, 0
	m.progressTarget = 0
}

func (m *playerModel) handleSharedEvent(event sharedEvent) tea.Cmd {
	switch event.kind {
	case sharedFailed:
		if event.err != nil {
			m.status = "Shared player: " + event.err.Error()
		}
	case sharedRegistered:
		m.deviceID = event.deviceID
		m.needsReconcile = m.cancelTrack != nil
		m.status = "Connected as " + m.deviceName + "."
	case sharedStateChanged:
		localTrack := ""
		if m.playingIndex >= 0 && m.playingIndex < len(m.queue) {
			localTrack = m.queue[m.playingIndex].ID
		}
		localPosition := m.position
		m.applySharedState(event.state)
		if m.needsReconcile {
			m.needsReconcile = false
			if m.cancelTrack != nil && containsString(m.shared.Devices, m.deviceID) {
				if !m.shared.Playing {
					return tea.Batch(m.scheduleControl(true, 0), m.progress.SetPercent(m.progressTarget))
				}
				if localTrack != m.shared.Track || (m.shared.Cycle() != m.currentCycle && math.Abs(localPosition-m.position) > 2) {
					return m.startSharedTrack(m.shared.Track, m.position, 0, m.shared.Cycle(), false)
				}
				return tea.Batch(m.scheduleControl(false, 0), m.progress.SetPercent(m.progressTarget), m.requestCover())
			}
		}
		return tea.Batch(m.progress.SetPercent(m.progressTarget), m.requestCover())
	case sharedCommand:
		if event.deviceID != m.deviceID {
			return nil
		}
		parts := strings.Split(event.action, ":")
		switch parts[0] {
		case "play", "resume":
			if len(parts) != 5 {
				return nil
			}
			position, err1 := strconv.ParseFloat(parts[2], 64)
			startAt, err2 := strconv.ParseInt(parts[3], 10, 64)
			cycle, err3 := strconv.ParseInt(parts[4], 10, 64)
			if err1 != nil || err2 != nil || err3 != nil {
				return nil
			}
			if parts[0] == "resume" && m.cancelTrack != nil && m.playingIndex >= 0 && m.playingIndex < len(m.queue) && m.queue[m.playingIndex].ID == parts[1] && math.Abs(m.position-position) < 2 {
				m.currentCycle = cycle
				m.lastPositionReport = time.Time{}
				return m.scheduleControl(false, startAt)
			}
			return m.startSharedTrack(parts[1], position, startAt, cycle, false)
		case "pause":
			if len(parts) != 2 {
				return nil
			}
			at, err := strconv.ParseInt(parts[1], 10, 64)
			if err == nil {
				return m.scheduleControl(true, at)
			}
		case "seek":
			if len(parts) != 3 || m.playingIndex < 0 || m.playingIndex >= len(m.queue) {
				return nil
			}
			position, err1 := strconv.ParseFloat(parts[1], 64)
			cycle, err2 := strconv.ParseInt(parts[2], 10, 64)
			if err1 == nil && err2 == nil {
				return m.startSharedTrack(m.queue[m.playingIndex].ID, position, 0, cycle, m.paused)
			}
		case "stop":
			m.stopLocal()
			return m.progress.SetPercent(0)
		}
	}
	return nil
}

func (m *playerModel) scheduleControl(paused bool, at int64) tea.Cmd {
	m.desiredPaused = paused
	wait := time.Duration(0)
	if at > 0 {
		wait = time.UnixMilli(at).Sub(m.serverNow())
	}
	if wait <= 0 {
		m.requestPause(paused)
		return nil
	}
	generation := m.generation
	return tea.Tick(wait, func(time.Time) tea.Msg {
		return delayedControl{generation: generation, paused: paused}
	})
}

func (m *playerModel) startSharedTrack(trackID string, position float64, startAt, cycle int64, paused bool) tea.Cmd {
	index := -1
	for i, track := range m.queue {
		if track.ID == trackID {
			index = i
			break
		}
	}
	if index < 0 {
		m.queue = append(m.queue, libraryTrack{track: track{ID: trackID}})
		index = len(m.queue) - 1
	}
	wait := time.Duration(0)
	if startAt > 0 {
		wait = time.UnixMilli(startAt).Sub(m.serverNow())
		if wait < 0 {
			position += (-wait).Seconds()
			wait = 0
		}
	}
	m.startPosition = max(position, 0)
	m.startPaused = paused || wait > 0
	m.currentCycle = cycle
	// The record holds a new run still until a device says it is making sound,
	// so the first report goes out as soon as the track plays rather than ten
	// seconds later.
	m.lastPositionReport = time.Time{}
	start := m.startTrack(index)
	return tea.Batch(start, m.scheduleControl(paused, startAt))
}

func (m *playerModel) openSearch() {
	m.searchReturn = searchSnapshot{
		query: m.query, filtered: append([]int(nil), m.filtered...),
		filteredTracks: append([]libraryTrack(nil), m.filteredTracks...),
		detail:         m.detail, searchResults: m.searchResults,
		albumIndex: m.albumIndex, trackIndex: m.trackIndex,
		albumOffset: m.albumOffset, trackOffset: m.trackOffset,
	}
	m.query = ""
	m.detail = false
	m.searching = true
	m.updateFilter()
}

func (m *playerModel) restoreSearch() {
	saved := m.searchReturn
	m.query = saved.query
	m.filtered = append(m.filtered[:0], saved.filtered...)
	m.filteredTracks = append(m.filteredTracks[:0], saved.filteredTracks...)
	m.detail, m.searchResults = saved.detail, saved.searchResults
	m.albumIndex, m.trackIndex = saved.albumIndex, saved.trackIndex
	m.albumOffset, m.trackOffset = saved.albumOffset, saved.trackOffset
	m.searching = false
}

func (m *playerModel) updateFilter() {
	m.filtered = m.filtered[:0]
	query := strings.ToLower(strings.TrimSpace(m.query))
	m.filteredTracks = m.filteredTracks[:0]
	for _, t := range m.library.Tracks {
		if query == "" || strings.Contains(strings.ToLower(t.Title+" "+t.artist+" "+t.album), query) {
			m.filteredTracks = append(m.filteredTracks, t)
		}
	}
	m.searchResults = m.searching || query != ""
	if m.searchResults {
		for i, a := range m.library.Albums {
			if strings.Contains(strings.ToLower(a.Album.Name+" "+a.Artist), query) {
				m.filtered = append(m.filtered, i)
			}
		}
		for i := range m.filteredTracks {
			m.filtered = append(m.filtered, -i-2)
		}
	} else {
		m.filtered = append(m.filtered, -1)
		for i := range m.library.Albums {
			m.filtered = append(m.filtered, i)
		}
	}
	m.albumIndex, m.albumOffset = 0, 0
}

func (m *playerModel) selectedAlbum() *LibraryAlbum {
	if m.library == nil || len(m.filtered) == 0 || m.albumIndex >= len(m.filtered) || m.filtered[m.albumIndex] < 0 {
		return nil
	}
	return &m.library.Albums[m.filtered[m.albumIndex]]
}

func (m *playerModel) selectedTracks() []libraryTrack {
	if a := m.selectedAlbum(); a != nil {
		return a.Tracks
	}
	if m.library != nil && len(m.filtered) > 0 {
		return m.filteredTracks
	}
	return nil
}

func (m *playerModel) selectedTrack() *libraryTrack {
	if m.library == nil {
		return nil
	}
	if m.detail {
		tracks := m.selectedTracks()
		if m.trackIndex >= 0 && m.trackIndex < len(tracks) {
			return &tracks[m.trackIndex]
		}
		return nil
	}
	if m.albumIndex < 0 || m.albumIndex >= len(m.filtered) {
		return nil
	}
	selected := m.filtered[m.albumIndex]
	if selected < -1 {
		index := -selected - 2
		if index >= 0 && index < len(m.filteredTracks) {
			return &m.filteredTracks[index]
		}
	}
	return nil
}

func (m *playerModel) rateSelected(value string) tea.Cmd {
	track := m.selectedTrack()
	if track == nil || m.ratingPending[track.ID] {
		return nil
	}
	if m.ratingPending == nil {
		m.ratingPending = make(map[string]bool)
	}
	m.ratingPending[track.ID] = true
	m.status = "Saving rating…"
	current := m.ratings[track.ID]
	trackID := track.ID
	return func() tea.Msg {
		rating, err := m.client.rateTrack(current, trackID, value)
		return ratingSaved{trackID: trackID, rating: rating, err: err}
	}
}

func (m *playerModel) requestCover() tea.Cmd {
	const rows = 4 // The artwork sits beside the four-line playback card.
	if !m.playing || m.playingIndex < 0 || m.playingIndex >= len(m.queue) {
		m.cover, m.coverID, m.coverRows, m.coverErr = nil, "", 0, ""
		return nil
	}
	id := m.queue[m.playingIndex].Album
	if id == "" {
		m.cover, m.coverID, m.coverRows, m.coverErr = nil, "", 0, ""
		return nil
	}
	if m.coverID == id && m.coverRows == rows {
		return nil
	}
	m.cover, m.coverID, m.coverRows, m.coverErr = nil, id, rows, ""
	return func() tea.Msg {
		lines, err := loadAlbumCover(m.client, id, rows)
		return coverLoaded{id, rows, lines, err}
	}
}

func (m *playerModel) waitPlayback(generation uint64, events <-chan PlaybackEvent, done <-chan error) tea.Cmd {
	return func() tea.Msg {
		select {
		case event := <-events:
			return playbackUpdate{generation: generation, event: event}
		case err := <-done:
			return trackFinished{generation: generation, err: err}
		case <-m.ctx.Done():
			return nil
		}
	}
}

func (m *playerModel) startTrack(index int) tea.Cmd {
	if index < 0 || index >= len(m.queue) {
		m.playing = false
		m.ready, m.paused, m.position = false, false, 0
		m.progressTarget = 0
		m.status = "Queue finished."
		return m.progress.SetPercent(0)
	}
	m.playing, m.playingIndex = true, index
	position, startPaused := m.startPosition, m.startPaused
	m.startPosition, m.startPaused = 0, false
	m.ready, m.paused, m.desiredPaused, m.position = false, startPaused, startPaused, position
	m.status = ""
	if m.cancelTrack != nil {
		m.cancelTrack()
	}
	m.generation++
	generation := m.generation
	ctx, cancel := context.WithCancel(m.ctx)
	m.cancelTrack = cancel
	controls := make(chan bool, 1)
	events := make(chan PlaybackEvent, 8)
	done := make(chan error, 1)
	m.controls, m.events, m.done = controls, events, done
	id := m.queue[index].ID
	m.workers.Add(1)
	go func() {
		defer m.workers.Done()
		done <- playTrackControlled(ctx, m.client, id, position, startPaused, controls, events)
	}()
	return tea.Batch(m.waitPlayback(generation, events, done), m.progress.SetPercent(0), m.startAnimation(), m.requestCover())
}

// Keep only the latest pending request if keys arrive faster than the player.
func (m *playerModel) requestPause(paused bool) {
	select {
	case m.controls <- paused:
	default:
		select {
		case <-m.controls:
		default:
		}
		select {
		case m.controls <- paused:
		default:
		}
	}
}

func (m *playerModel) changeTrackOnce(action string) tea.Cmd {
	if m.shared.Track == "" {
		return nil
	}
	m.trackGeneration++
	generation := m.trackGeneration
	// Terminals report key auto-repeat as more key presses, with no release
	// event. Waiting until they stop turns a held key into one track order.
	return tea.Tick(200*time.Millisecond, func(time.Time) tea.Msg {
		return trackSettled{generation: generation, action: action}
	})
}

func (m *playerModel) seekBy(delta float64) tea.Cmd {
	if m.shared.Track == "" {
		return nil
	}
	target := max(m.position+delta, 0)
	if m.playingIndex >= 0 && m.playingIndex < len(m.queue) && m.queue[m.playingIndex].Duration > 0 {
		target = min(target, m.queue[m.playingIndex].Duration)
	}
	if target == m.position {
		return nil
	}
	m.position, m.seekTarget = target, target
	m.syncProgressTarget()
	m.seekGeneration++
	generation := m.seekGeneration
	trackID := m.shared.Track
	settled := tea.Tick(100*time.Millisecond, func(time.Time) tea.Msg {
		return seekSettled{generation: generation, track: trackID}
	})
	return tea.Batch(m.progress.SetPercent(m.progressTarget), settled)
}

func (m *playerModel) quit() tea.Cmd {
	deviceID := m.deviceID
	if deviceID == "" || !containsString(m.shared.Devices, deviceID) {
		return tea.Quit
	}
	return func() tea.Msg {
		// Leaving is the explicit, immediate counterpart of the presence stream
		// disappearing. Quit regardless of the answer: a dead server must not
		// trap somebody in a terminal they asked to close.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = sharedOrderContext(ctx, m.client, "leave", map[string]string{"deviceId": deviceID})
		return tea.QuitMsg{}
	}
}

func (m *playerModel) order(path string, body any) tea.Cmd {
	return func() tea.Msg {
		return sharedOrder(m.client, path, body)
	}
}

func (m *playerModel) resumeShared() tea.Cmd {
	deviceID := m.deviceID
	alone := len(m.shared.Devices) == 1 && containsString(m.shared.Devices, deviceID)
	return func() tea.Msg {
		if deviceID == "" {
			return sharedEvent{kind: sharedFailed, err: errors.New("the shared player is not connected yet")}
		}
		if !alone {
			if event := sharedOrder(m.client, "devices", map[string][]string{"deviceIds": {deviceID}}); event.err != nil {
				return event
			}
		}
		return sharedOrder(m.client, "resume", map[string]any{})
	}
}

func (m *playerModel) playTracks(tracks []libraryTrack, index int) tea.Cmd {
	if len(tracks) == 0 {
		m.status = "No tracks to play."
		return nil
	}
	if m.deviceID == "" {
		m.status = "The shared player is not connected yet."
		return nil
	}
	if index < 0 || index >= len(tracks) {
		index = 0
	}
	if tracks[index].ID == m.shared.Track {
		if m.shared.Playing {
			return m.order("pause", map[string]any{})
		}
		return m.resumeShared()
	}
	ordered := append(append([]libraryTrack(nil), tracks[index:]...), tracks[:index]...)
	ids := make([]string, 0, len(ordered))
	for _, track := range ordered {
		ids = append(ids, track.ID)
	}
	deviceID := m.deviceID
	alone := len(m.shared.Devices) == 1 && containsString(m.shared.Devices, deviceID)
	m.status = "Starting shared playback…"
	return func() tea.Msg {
		if deviceID == "" {
			return sharedEvent{kind: sharedFailed, err: errors.New("the shared player is not connected yet")}
		}
		if !alone {
			if event := sharedOrder(m.client, "devices", map[string][]string{"deviceIds": {deviceID}}); event.err != nil {
				return event
			}
		}
		return sharedOrder(m.client, "play", map[string][]string{"tracks": ids})
	}
}

func (m *playerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	m.ensureComponents()
	switch msg := msg.(type) {
	case spinner.TickMsg:
		m.animationRunning = false
		m.animationFrame++
		if !m.animationActive() {
			return m, nil
		}
		var progressCmd tea.Cmd
		if m.cancelTrack == nil && m.shared.Playing && !m.shared.Waiting && m.shared.Track != "" && !m.shared.PositionAt.IsZero() {
			m.position = max(m.shared.Position+m.serverNow().Sub(m.shared.PositionAt.Time).Seconds(), 0)
			m.syncProgressTarget()
			progressCmd = m.progress.SetPercent(m.progressTarget)
		}
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		m.animationRunning = cmd != nil
		return m, tea.Batch(cmd, progressCmd)
	case progress.FrameMsg:
		updated, cmd := m.progress.Update(msg)
		m.progress = updated.(progress.Model)
		return m, cmd
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, m.requestCover()
	case libraryLoaded:
		m.loading = false
		if msg.err != nil {
			m.status = "Library failed: " + msg.err.Error()
			return m, nil
		}
		m.library = msg.library
		m.updateFilter()
		m.syncSharedQueue()
		m.syncProgressTarget()
		return m, tea.Batch(m.progress.SetPercent(m.progressTarget), m.requestCover())
	case ratingsLoaded:
		if msg.err != nil {
			m.status = "Ratings unavailable: " + msg.err.Error()
			return m, nil
		}
		m.ratings = msg.ratings
	case ratingSaved:
		delete(m.ratingPending, msg.trackID)
		if msg.err != nil {
			m.status = "Rating failed: " + msg.err.Error()
			return m, nil
		}
		if msg.rating.ID == "" {
			delete(m.ratings, msg.trackID)
			m.status = "Rating removed."
		} else {
			if m.ratings == nil {
				m.ratings = make(map[string]trackRating)
			}
			m.ratings[msg.trackID] = msg.rating
			m.status = "Track " + msg.rating.Value + "d."
		}
	case coverLoaded:
		if msg.id == m.coverID && msg.rows == m.coverRows {
			m.cover = msg.lines
			if msg.err != nil {
				m.coverErr = "Cover unavailable: " + msg.err.Error()
			}
		}
	case sharedStreamMsg:
		return m, tea.Batch(m.handleSharedEvent(msg.event), m.waitShared())
	case sharedEvent:
		return m, m.handleSharedEvent(msg)
	case trackSettled:
		if msg.generation == m.trackGeneration && m.shared.Track != "" {
			m.status = "Skipping…"
			return m, m.order(msg.action, map[string]any{})
		}
		return m, nil
	case seekSettled:
		if msg.generation == m.seekGeneration && m.shared.Track == msg.track {
			return m, m.order("seek", map[string]float64{"position": m.seekTarget})
		}
		return m, nil
	case delayedControl:
		if msg.generation == m.generation {
			m.requestPause(msg.paused)
		}
		return m, nil
	case playbackUpdate:
		if !m.playing || msg.generation != m.generation {
			return m, nil
		}
		m.paused, m.ready = msg.event.Paused, msg.event.Ready
		if msg.event.Ready {
			m.position = msg.event.Position
		}
		m.syncProgressTarget()
		progressCmd := m.progress.SetPercent(m.progressTarget)
		var report tea.Cmd
		if m.ready && !m.paused && m.currentCycle != 0 && time.Since(m.lastPositionReport) >= 10*time.Second && m.playingIndex >= 0 && m.playingIndex < len(m.queue) {
			m.lastPositionReport = time.Now()
			trackID, position, cycle := m.queue[m.playingIndex].ID, m.position, m.currentCycle
			report = func() tea.Msg {
				err := m.client.send("POST", "/api/player/position", map[string]any{
					"trackId": trackID, "position": position, "cycle": cycle,
				}, nil)
				if err != nil {
					return sharedEvent{kind: sharedFailed, err: err}
				}
				return nil
			}
		}
		return m, tea.Batch(m.waitPlayback(m.generation, m.events, m.done), progressCmd, report)
	case trackFinished:
		if !m.playing || msg.generation != m.generation {
			return m, nil
		}
		if m.cancelTrack != nil {
			m.cancelTrack()
			m.cancelTrack = nil
		}
		if errors.Is(msg.err, context.Canceled) {
			m.playing = false
			return m, nil
		}
		if msg.err != nil {
			m.playing = false
			m.status = "Playback failed: " + msg.err.Error()
			if m.deviceID != "" && containsString(m.shared.Devices, m.deviceID) {
				return m, m.order("leave", map[string]string{"deviceId": m.deviceID})
			}
			return m, nil
		}
		if m.playingIndex < 0 || m.playingIndex >= len(m.queue) {
			return m, nil
		}
		trackID, cycle := m.queue[m.playingIndex].ID, m.currentCycle
		m.ready = false
		m.status = "Loading next track…"
		return m, func() tea.Msg {
			return sharedOrder(m.client, "ended", map[string]any{"trackId": trackID, "cycle": cycle})
		}
	case tea.KeyMsg:
		key := msg.String()
		if key == "ctrl+c" {
			return m, m.quit()
		}
		if m.helpOpen {
			switch key {
			case "esc", "?":
				m.helpOpen = false
			case "q":
				return m, m.quit()
			}
			return m, nil
		}
		if m.searching {
			switch key {
			case "esc":
				m.restoreSearch()
				return m, nil
			case "enter":
				if len(m.filtered) == 0 {
					return m, nil
				}
				selected := m.filtered[m.albumIndex]
				if selected < -1 {
					tracks := append([]libraryTrack(nil), m.filteredTracks...)
					index := -selected - 2
					m.restoreSearch()
					return m, m.playTracks(tracks, index)
				}
				m.searching = false
				m.searchResults = true
			case "right":
				if len(m.filtered) == 0 {
					return m, nil
				}
				selected := m.filtered[m.albumIndex]
				if selected < -1 {
					return m, m.playTracks(m.filteredTracks, -selected-2)
				}
				return m, m.playTracks(m.selectedTracks(), 0)
			case "up":
				if len(m.filtered) > 0 {
					m.albumIndex = (m.albumIndex - 1 + len(m.filtered)) % len(m.filtered)
				}
			case "down":
				if len(m.filtered) > 0 {
					m.albumIndex = (m.albumIndex + 1) % len(m.filtered)
				}
			case "backspace", "ctrl+h":
				runes := []rune(m.query)
				if len(runes) > 0 {
					m.query = string(runes[:len(runes)-1])
					m.updateFilter()
				}
			case "ctrl+u":
				m.query = ""
				m.updateFilter()
			case " ":
				m.query += " "
				m.updateFilter()
			default:
				if msg.Type == tea.KeyRunes {
					m.query += string(msg.Runes)
					m.updateFilter()
				}
			}
			if key != "enter" {
				return m, m.startAnimation()
			}
		}
		switch key {
		case "q":
			return m, m.quit()
		case " ":
			if m.shared.Track != "" {
				if m.shared.Playing {
					return m, m.order("pause", map[string]any{})
				}
				return m, m.resumeShared()
			}
		case "r":
			repeat := "none"
			if m.repeat == repeatOff {
				repeat = "all"
			} else if m.repeat == repeatAll {
				repeat = "one"
			}
			return m, m.order("repeat", map[string]string{"repeat": repeat})
		case "f", "F":
			return m, m.rateSelected("like")
		case "d", "D":
			return m, m.rateSelected("dislike")
		case ",":
			return m, m.seekBy(-5)
		case ".":
			return m, m.seekBy(5)
		case "n":
			return m, m.changeTrackOnce("next")
		case "s":
			if m.deviceID != "" && containsString(m.shared.Devices, m.deviceID) {
				m.status = "Leaving shared playback…"
				return m, m.order("leave", map[string]string{"deviceId": m.deviceID})
			}
			m.stopLocal()
		case "?":
			m.helpOpen = true
		case "/":
			if m.library != nil {
				m.openSearch()
			}
		case "esc", "backspace", "left", "h":
			if m.searchResults {
				m.restoreSearch()
				return m, nil
			}
			if m.detail {
				m.detail = false
			}
		case "up", "k":
			if m.detail {
				if count := len(m.selectedTracks()); count > 0 {
					m.trackIndex = (m.trackIndex - 1 + count) % count
				}
			} else if len(m.filtered) > 0 {
				m.albumIndex = (m.albumIndex - 1 + len(m.filtered)) % len(m.filtered)
			}
		case "down", "j":
			if m.detail {
				if count := len(m.selectedTracks()); count > 0 {
					m.trackIndex = (m.trackIndex + 1) % count
				}
			} else if len(m.filtered) > 0 {
				m.albumIndex = (m.albumIndex + 1) % len(m.filtered)
			}
		case "pgup":
			if m.detail {
				m.trackIndex -= m.listHeight()
				if m.trackIndex < 0 {
					m.trackIndex = 0
				}
			} else {
				m.albumIndex -= m.listHeight()
				if m.albumIndex < 0 {
					m.albumIndex = 0
				}
			}
		case "pgdown":
			if m.detail {
				m.trackIndex += m.listHeight()
				if m.trackIndex >= len(m.selectedTracks()) {
					m.trackIndex = len(m.selectedTracks()) - 1
				}
				if m.trackIndex < 0 {
					m.trackIndex = 0
				}
			} else {
				m.albumIndex += m.listHeight()
				if m.albumIndex >= len(m.filtered) {
					m.albumIndex = len(m.filtered) - 1
				}
				if m.albumIndex < 0 {
					m.albumIndex = 0
				}
			}
		case "enter", "right", "l":
			if m.detail {
				return m, m.playTracks(m.selectedTracks(), m.trackIndex)
			}
			if len(m.filtered) > 0 && m.filtered[m.albumIndex] < -1 {
				return m, m.playTracks(m.filteredTracks, -m.filtered[m.albumIndex]-2)
			}
			if len(m.filtered) > 0 {
				m.detail = true
				m.trackIndex, m.trackOffset = 0, 0
				return m, nil
			}
		case "p":
			return m, m.changeTrackOnce("previous")
		}
	}
	return m, m.startAnimation()
}

func (m *playerModel) listHeight() int {
	reserved := 8
	if m.height >= 12 {
		reserved += 2 // Main panel border.
	}
	return max(m.height-reserved, 1)
}

func formatPlaybackTime(seconds float64) string {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		seconds = 0
	}
	if seconds > math.MaxInt32 {
		seconds = math.MaxInt32
	}
	total := int64(seconds)
	if total >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", total/3600, total/60%60, total%60)
	}
	return fmt.Sprintf("%d:%02d", total/60, total%60)
}

// cleanText prevents server-supplied control characters from altering the terminal.
func cleanText(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, s)
}

func scrollOffset(offset, selected, count, height int) int {
	if height <= 0 || count == 0 {
		return 0
	}
	if selected < offset {
		offset = selected
	}
	if selected >= offset+height {
		offset = selected - height + 1
	}
	if offset > count-height {
		offset = count - height
	}
	if offset < 0 {
		offset = 0
	}
	return offset
}

func terminalColorEnabled() bool {
	_, noColor := os.LookupEnv("NO_COLOR")
	return !noColor && !strings.EqualFold(os.Getenv("TERM"), "dumb")
}

func (m *playerModel) View() string {
	return renderPlayer(m)
}
