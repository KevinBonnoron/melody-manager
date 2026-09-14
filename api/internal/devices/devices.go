// Package devices discovers and controls playback devices (Sonos) and exposes
// the live device list over SSE.
package devices

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"math"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// Device is the API shape consumed by the client (matches the shared Device union).
type Device struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Status    string         `json:"status"`
	Metadata  map[string]any `json:"metadata"`
	IPAddress string         `json:"ipAddress"`
	Volume    int            `json:"volume"`
	IsActive  bool           `json:"isActive"`
	// Whether anybody may play to it. A speaker is discovered whatever the
	// operator has decided, so that a new one can be offered to an admin; this is
	// what says whether the decision was yes.
	Usable bool `json:"usable"`

	Session string `json:"session,omitempty"`
	Playing bool   `json:"playing"`
	TrackID string `json:"trackId"`
	// Position is live: a client reports it only when it changes, and the server
	// advances it on the way out. A client joining midway therefore gets the
	// position as of that message and only has to count from its own arrival.
	Position float64 `json:"position"`

	// Never serialised: a client device belongs to one user and lives exactly as
	// long as the stream it opened. The epoch tells two streams of the same
	// client apart, since both derive the same id from the same session.
	owner      string
	epoch      uint64
	reportedAt time.Time
}

// speakerPollInterval is how often a speaker is asked where it is. Clients count
// the seconds between two reports on their own, so this only has to correct that
// count, not drive it.
const speakerPollInterval = 5 * time.Second

// speakerIdlePolls is how many silent rounds end the watch. A speaker that was
// paused is usually resumed, so the watch outlives a pause rather than stopping
// and missing the resume.
const speakerIdlePolls = 6

type speakerWatch struct{ nudge chan struct{} }

// WatchSpeaker keeps a speaker's reported state fresh for as long as it plays,
// and pushes it to every client over the stream they already listen on. One
// poller serves them all: each tab asking the speaker itself meant three SOAP
// calls a second per tab, to a device that answers them one at a time.
func (s *Service) WatchSpeaker(id string) {
	watch := &speakerWatch{nudge: make(chan struct{}, 1)}
	if existing, running := s.watching.LoadOrStore(id, watch); running {
		// Already watched: ask it to report now rather than at its next round,
		// so a command given on one client reaches the others at once.
		select {
		case existing.(*speakerWatch).nudge <- struct{}{}:
		default:
		}
		return
	}

	go func() {
		defer s.watching.Delete(id)
		idle, wasPlaying, lastSaved := 0, false, time.Time{}
		for {
			playing, remaining, ok := s.pollSpeaker(id)
			if !ok {
				return
			}

			// The resume point is written on a slow beat while it plays, and at
			// the moment it stops, which is the position anyone coming back
			// expects to find.
			if playing && (!wasPlaying || time.Since(lastSaved) >= speakerSaveInterval) {
				lastSaved = time.Now()
				s.saveSpeakerPosition(id)
			} else if !playing && wasPlaying {
				s.saveSpeakerPosition(id)
			}
			wasPlaying = playing

			if playing {
				idle = 0
			} else if idle++; idle >= speakerIdlePolls {
				return
			}

			select {
			case <-time.After(pollDelay(playing, remaining)):
			case <-watch.nudge:
			}
		}
	}()
}

// pollDelay tightens the rounds as a track runs out. Nothing but the speaker
// knows it has finished, and the queue only moves on once that is reported, so
// the last seconds are worth watching closely and the rest are not.
func pollDelay(playing bool, remaining float64) time.Duration {
	if playing && remaining > 0 && remaining <= speakerEndingWindow.Seconds() {
		return speakerEndingInterval
	}
	return speakerPollInterval
}

const (
	speakerEndingWindow   = 12 * time.Second
	speakerEndingInterval = time.Second
)

// SetPlaybackStore is wired once the database is available, which is after the
// registry itself exists.
func (s *Service) SetPlaybackStore(store PlaybackStore) {
	s.mu.Lock()
	s.playback = store
	s.mu.Unlock()
}

// SetPlayers hands the service the protocols it can speak. Without it there are
// no speakers at all: a client of one's own still registers, it just has nowhere
// to send sound.
func (s *Service) SetPlayers(registry players.Registry) {
	s.playersMu.Lock()
	s.players = registry
	s.playersMu.Unlock()
}

func (s *Service) registry() players.Registry {
	s.playersMu.RLock()
	defer s.playersMu.RUnlock()
	return s.players
}

// speaks reports whether a device kind is one this server controls over the
// network, as opposed to a client of the user's own, which is told what to do
// over the stream it opened.
func (s *Service) speaks(kind string) bool {
	_, ok := s.registry().For(kind)
	return ok
}

// PlayerFor answers which protocol a device speaks, for the routes, which have
// to reach the device directly to hand it a track or move it.
func (s *Service) PlayerFor(device Device) (players.Player, bool) {
	return s.playerFor(device)
}

// playerFor answers which protocol a device speaks, and whether this server
// speaks it. A client of the user's own speaks none: it is told what to do over
// the stream it opened, not over the network.
func (s *Service) playerFor(device Device) (players.Player, bool) {
	return s.registry().For(device.Type)
}

// SetSpeakerStore hands the service where speaker addresses live. Like the
// playback store, it is set once the database exists rather than at construction.
func (s *Service) SetSpeakerStore(store SpeakerStore) {
	s.mu.Lock()
	s.speakers = store
	s.mu.Unlock()
}

// SetSpeakerTrack records what a speaker was told to play, and for whom. The
// speaker knows a URL, not a track, so this is the only place the two are tied
// together; the owner is what makes the resume point belong to someone.
func (s *Service) SetSpeakerTrack(id, owner, trackID string) {
	s.mu.Lock()
	device, ok := s.devices[id]
	if !ok || !s.speaks(device.Type) {
		s.mu.Unlock()
		return
	}
	if owner != "" {
		device.owner = owner
	}
	device.TrackID = trackID
	s.devices[id] = device
	snapshot := s.listLocked()
	s.mu.Unlock()
	s.notify(snapshot)
}

// pollSpeaker asks a speaker where it is and records it. ok is false once the
// speaker is gone from the registry, which ends the watch.
func (s *Service) pollSpeaker(id string) (playing bool, remaining float64, ok bool) {
	s.mu.RLock()
	device, known := s.devices[id]
	s.mu.RUnlock()
	if !known {
		return false, 0, false
	}
	player, speaks := s.playerFor(device)
	if !speaks {
		return false, 0, false
	}

	ctx, cancel := context.WithTimeout(context.Background(), speakerPollTimeout)
	defer cancel()
	state := player.Transport(ctx, device.IPAddress)
	position, duration := player.Position(ctx, device.IPAddress)
	volume := player.Volume(ctx, device.IPAddress)

	// A speaker still buffering reports TRANSITIONING, which is on its way to
	// playing, not stopped.
	playing = state != "STOPPED" && state != "PAUSED_PLAYBACK" && state != "UNKNOWN"
	// A speaker that plays a track nobody recorded is one this server lost track
	// of, through a restart or a race with discovery. It still holds the URL, so
	// the answer is one call away and worth making once rather than never.
	if playing && device.TrackID == "" {
		s.SetSpeakerTrack(id, "", trackFromStreamURL(player.CurrentURL(ctx, device.IPAddress)))
	}

	s.reportSpeaker(id, playing, float64(position), volume)
	return playing, float64(duration - position), true
}

const speakerPollTimeout = 5 * time.Second

// reportSpeaker records what a speaker answered. Unlike a client device it is
// shared, so the change reaches every subscriber rather than one owner.
func (s *Service) reportSpeaker(id string, playing bool, position float64, volume int) {
	s.mu.Lock()
	device, ok := s.devices[id]
	if !ok || !s.speaks(device.Type) {
		s.mu.Unlock()
		return
	}

	changed := device.Playing != playing || device.Volume != volume || positionJumped(device, position)
	device.Playing = playing
	device.Position = position
	device.reportedAt = time.Now()
	device.Volume = volume
	device.Status = "available"
	if playing {
		device.Status = "playing"
	}
	s.devices[id] = device
	snapshot := s.listLocked()
	s.mu.Unlock()
	if changed {
		s.notify(snapshot)
	}
}

// speakerSaveInterval is how often a playing speaker's position is written
// down. It is a resume point, not a clock: a few seconds either way costs
// nothing, and a write every poll would cost a row update every five seconds.
const speakerSaveInterval = 15 * time.Second

func (s *Service) saveSpeakerPosition(id string) {
	s.mu.RLock()
	device, ok := s.devices[id]
	store := s.playback
	s.mu.RUnlock()
	if !ok || store == nil || device.owner == "" || device.TrackID == "" {
		return
	}

	if err := store.SavePosition(device.owner, device.TrackID, device.Position); err != nil {
		slog.Warn("playback position not saved", "device", id, "error", err)
	}
}

// positionJumped separates ordinary playback drift from a real seek: what makes
// it a seek is the position landing away from where it was heading on its own.
func positionJumped(device Device, position float64) bool {
	expected := device.Position
	if device.Playing && !device.reportedAt.IsZero() {
		expected += time.Since(device.reportedAt).Seconds()
	}
	return math.Abs(position-expected) > positionJumpTolerance
}

// Command is pushed to a single browser device over its owner's stream.
type Command struct {
	DeviceID string `json:"deviceId"`
	Action   string `json:"action"`
}

// PlaybackStore records where a user's playback got to. A speaker plays on its
// own and no browser is watching it, so the server writes the resume point for
// the person who started it rather than leaving an idle client to guess.
type PlaybackStore interface {
	SavePosition(owner, trackID string, position float64) error
}

// SpeakerStore holds what the operator decided about each speaker: which ones
// to try directly when multicast gets nowhere, and which ones may be played to.
type SpeakerStore interface {
	KnownSpeakers(kind string) []string
	// Whether the server may play to this address. Discovery runs regardless, so
	// that a speaker appearing on the network can be offered to an admin; this is
	// what says whether anyone agreed to it.
	SpeakerUsable(kind, address string) bool
}

// Service maintains the device registry and notifies subscribers on changes.
type Service struct {
	publicURL func() string

	watching sync.Map // speaker id -> *speakerWatch

	playback PlaybackStore

	// Its own lock, not s.mu: the two questions it answers are asked from inside
	// sections that already hold s.mu, and a Go RWMutex is not reentrant.
	playersMu sync.RWMutex
	players   players.Registry

	mu        sync.RWMutex
	devices   map[string]Device // by id
	subs      map[int]subscriber
	nextSub   int
	nextEpoch uint64
	speakers  SpeakerStore

	// Device id per (owner, session). The id is the server's to hand out, so it
	// is generated rather than built from anything the client sends; the mapping
	// is what makes a reconnecting client land on its own device again.
	sessions map[string]string
}

type subscriber struct {
	owner    string
	devices  chan []Device
	commands chan Command
}

// New creates a device service. serverURL is the public base URL used to build
// stream URLs that Sonos players fetch.
func New(publicURL func() string) *Service {
	return &Service{publicURL: publicURL, devices: map[string]Device{}, subs: map[int]subscriber{}, sessions: map[string]string{}}
}

// nudges asks the running service to re-read what the operator decided. A
// speaker put in service has to appear now, not up to a discovery pass later:
// the admin who just saved is looking at the screen.
var nudges = make(chan struct{}, 1)

// Nudge reports that the speaker configuration changed.
func Nudge() {
	select {
	case nudges <- struct{}{}:
	default:
	}
}

// StartDiscovery polls SSDP every 10s and keeps the registry in sync.
func (s *Service) StartDiscovery() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		s.discoverOnce()
		for {
			select {
			case <-ticker.C:
				s.discoverOnce()
			case <-nudges:
				// Only the decisions are re-read. Discovery is two seconds of
				// waiting on a multicast answer, and nothing about saving a
				// configuration says the network changed.
				s.refreshUsable()
			}
		}
	}()
}

// refreshUsable re-reads whether each speaker may be played to, without going
// back to the network for it.
func (s *Service) refreshUsable() {
	registry := s.registry()
	s.mu.RLock()
	speakers := make(map[string]Device, len(s.devices))
	for id, device := range s.devices {
		if _, ok := registry.For(device.Type); ok {
			speakers[id] = device
		}
	}
	s.mu.RUnlock()

	// Asked before taking the write lock: each answer is a database read, and
	// holding the lock across them blocks every reader, /api/devices and the SSE
	// stream included.
	usable := make(map[string]bool, len(speakers))
	for id, device := range speakers {
		usable[id] = s.speakerUsable(device.Type, device.IPAddress)
	}

	s.mu.Lock()
	changed := false
	for id, next := range usable {
		device, ok := s.devices[id]
		if !ok || device.Usable == next {
			continue
		}
		device.Usable = next
		s.devices[id] = device
		changed = true
	}
	if !changed {
		s.mu.Unlock()
		return
	}
	snapshot := s.listLocked()
	s.mu.Unlock()
	s.notify(snapshot)
}

// Types a client may register itself as. Sonos is absent on purpose: those are
// discovered over SSDP, never announced, so nobody gets to claim one.
// positionJumpTolerance separates ordinary playback drift from a real seek.
const positionJumpTolerance = 2.0

var clientTypes = map[string]bool{"browser": true, "mobile": true, "desktop": true}

// RegisterClient declares one open client of a user. The id is derived from the
// session so a reload or a retry converges on the same device instead of piling
// up new ones.
func (s *Service) RegisterClient(owner, deviceType, session, label string) (Device, bool) {
	if !clientTypes[deviceType] || session == "" {
		return Device{}, false
	}

	s.mu.Lock()
	key := owner + "\x00" + session
	id, known := s.sessions[key]
	if !known {
		id = newDeviceID()
		s.sessions[key] = id
	}

	device, existed := s.devices[id]
	if !existed {
		device = Device{ID: id, Type: deviceType, Metadata: map[string]any{}, Session: session, owner: owner}
	} else if device.owner != owner {
		s.mu.Unlock()
		return Device{}, false
	}
	device.Type = deviceType
	device.Name = label
	device.Status = "available"
	// A client announcing itself is a device its own user asked for: there is
	// nothing left to agree to, unlike a speaker found on the network.
	device.Usable = true
	s.nextEpoch++
	device.epoch = s.nextEpoch
	s.devices[id] = device
	snapshot := s.listLocked()
	s.mu.Unlock()
	if !existed {
		s.notifyOwner(owner, snapshot)
	}
	return device, true
}

// Epoch identifies the registration a stream owns, to hand back on teardown.
func (d Device) Epoch() uint64 { return d.epoch }

// ReportState records what a client is doing. It fails when the device is
// unknown, which is the client's cue to open its stream again.
func (s *Service) ReportState(owner, id string, playing bool, trackID string, position float64, volume int) bool {
	s.mu.Lock()
	device, ok := s.devices[id]
	if !ok || !clientTypes[device.Type] || device.owner != owner {
		s.mu.Unlock()
		return false
	}

	changed := device.Playing != playing || device.TrackID != trackID || device.Volume != volume || positionJumped(device, position)
	device.Playing = playing
	device.TrackID = trackID
	device.Position = position
	device.reportedAt = time.Now()
	device.Volume = volume
	device.Status = "available"
	if playing {
		device.Status = "playing"
	}
	s.devices[id] = device
	snapshot := s.listLocked()
	s.mu.Unlock()
	if changed {
		s.notifyOwner(owner, snapshot)
	}
	return true
}

// UnregisterClient drops a client whose stream has ended. A stream only removes
// the registration it created: a client reconnecting registers before the old
// stream is done tearing down, and both address the same id.
func (s *Service) UnregisterClient(owner, id string, epoch uint64) {
	s.mu.Lock()
	d, ok := s.devices[id]
	if !ok || !clientTypes[d.Type] || d.owner != owner || d.epoch != epoch {
		s.mu.Unlock()
		return
	}
	delete(s.devices, id)
	snapshot := s.listLocked()
	s.mu.Unlock()
	s.notifyOwner(owner, snapshot)
}

// SendCommand hands a transport action to one browser device.
func (s *Service) SendCommand(deviceID, action string) bool {
	s.mu.RLock()
	device, ok := s.devices[deviceID]
	if !ok || !clientTypes[device.Type] {
		s.mu.RUnlock()
		return false
	}
	command := Command{DeviceID: deviceID, Action: action}
	for _, sub := range s.subs {
		if sub.owner == device.owner {
			select {
			case sub.commands <- command:
			default:
			}
		}
	}
	s.mu.RUnlock()
	return true
}

func (s *Service) discoverOnce() {
	for _, player := range s.registry() {
		s.discoverKind(player)
	}
}

// discoverKind asks one protocol who is on the network, and folds the answer
// into the registry.
func (s *Service) discoverKind(player players.Player) {
	ctx := context.Background()
	kind := player.Kind()
	found := player.Discover(ctx, 2*time.Second)

	// A speaker stops answering a broadcast without warning while still serving
	// everything else, so an address seen once is confirmed directly from then on
	// rather than being dropped for staying quiet.
	answered := map[string]bool{}
	for _, device := range found {
		answered[device.Address] = true
	}
	for _, address := range s.knownSpeakers(kind) {
		if answered[address] {
			continue
		}
		if device, ok := player.Describe(ctx, address); ok {
			found = append(found, device)
		}
	}

	if len(found) == 0 {
		return
	}

	// Volumes are fetched before taking the lock: this is a blocking call per
	// speaker, and holding the write lock across it let one unresponsive device
	// block every reader, /api/devices, the SSE stream and each per-device route,
	// for as long as it stayed silent.
	volumeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	volumes := make(map[string]int, len(found))
	for _, device := range found {
		volumes[device.Address] = player.Volume(volumeCtx, device.Address)
	}
	cancel()

	// Usable is settled on every pass rather than at first sight: an admin
	// switching a speaker off, or the kind out of service, has to reach the
	// registry without waiting for the speaker to be discovered again.
	usable := make(map[string]bool, len(found))
	for _, device := range found {
		usable[device.Address] = s.speakerUsable(kind, device.Address)
	}

	s.mu.Lock()
	for _, device := range found {
		id := ipToID(device.Address)
		s.devices[id] = refreshSpeaker(s.devices[id], device, kind, volumes[device.Address], usable[device.Address])
	}
	snapshot := s.listLocked()
	s.mu.Unlock()
	s.notify(snapshot)

	for _, device := range found {
		go s.adopt(ipToID(device.Address))
	}
}

// refreshSpeaker folds what discovery just learned into what is already known
// about a speaker. Discovery only ever sees a device on the network: what it is
// playing is reported separately and every ten seconds, so rebuilding the entry
// here would wipe it, leaving a speaker that plays while the registry says it
// holds nothing.
func refreshSpeaker(device Device, found players.Found, kind string, volume int, usable bool) Device {
	if device.ID == "" {
		device = Device{ID: ipToID(found.Address), Status: "available"}
	}
	device.Name = found.Name
	device.Type = kind
	device.IPAddress = found.Address
	device.Volume = volume
	device.Usable = usable
	device.Metadata = map[string]any{"uuid": found.ID, "roomName": found.Name}
	return device
}

// adopt picks up a speaker that is already playing: one left running by a
// previous run of this server, or started from the Sonos app. Without this a
// restart loses track of sound that never stopped coming out.
func (s *Service) adopt(id string) {
	if _, alreadyWatched := s.watching.Load(id); alreadyWatched {
		return
	}

	s.mu.RLock()
	device, known := s.devices[id]
	s.mu.RUnlock()
	if !known {
		return
	}
	player, speaks := s.playerFor(device)
	if !speaks {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), speakerPollTimeout)
	defer cancel()
	// Discovery comes round every ten seconds and most speakers are idle most of
	// the time, so ask the one question that decides it before asking the rest.
	if state := player.Transport(ctx, device.IPAddress); state != "PLAYING" && state != "TRANSITIONING" {
		return
	}

	s.SetSpeakerTrack(id, "", trackFromStreamURL(player.CurrentURL(ctx, device.IPAddress)))
	s.WatchSpeaker(id)
}

// trackFromStreamURL reads back the track out of a URL this server handed the
// speaker. Anything else it may be playing, a radio or a line-in, names no
// track of ours.
func trackFromStreamURL(uri string) string {
	_, rest, found := strings.Cut(uri, tracksPathPrefix)
	if !found {
		return ""
	}

	// Only a stream names the track a speaker is playing: the same prefix leads
	// to other things about a track, and none of them is what it holds.
	id, sub, found := strings.Cut(rest, "/")
	if !found || !strings.HasPrefix(sub, "stream") {
		return ""
	}
	return id
}

const tracksPathPrefix = "/api/tracks/"

func (s *Service) speakerUsable(kind, address string) bool {
	s.mu.RLock()
	store := s.speakers
	s.mu.RUnlock()
	// Until the database is there to ask, a speaker is usable: the server has
	// always played to what it found, and refusing for the first few seconds of a
	// restart would be a new way to fail.
	if store == nil {
		return true
	}
	return store.SpeakerUsable(kind, address)
}

func (s *Service) knownSpeakers(kind string) []string {
	s.mu.RLock()
	store := s.speakers
	s.mu.RUnlock()
	if store == nil {
		return nil
	}
	return store.KnownSpeakers(kind)
}

// List returns the shared devices plus the caller's own browser clients.
func (s *Service) List(owner string) []Device {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return forOwner(s.listLocked(), owner)
}

func forOwner(all []Device, owner string) []Device {
	out := make([]Device, 0, len(all))
	for _, d := range all {
		if !clientTypes[d.Type] || d.owner == owner {
			out = append(out, d)
		}
	}
	return out
}

func (s *Service) listLocked() []Device {
	now := time.Now()
	out := make([]Device, 0, len(s.devices))
	for _, d := range s.devices {
		// Only a playing device has moved since it last reported; a paused one
		// sits exactly where it said it was.
		if d.Playing && !d.reportedAt.IsZero() {
			d.Position += now.Sub(d.reportedAt).Seconds()
		}
		out = append(out, d)
	}
	return out
}

// Get returns a device by id.
func (s *Service) Get(id string) (Device, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.devices[id]
	return d, ok
}

// Subscribe returns the streams a single user's client listens on.
func (s *Service) Subscribe(owner string) (<-chan []Device, <-chan Command, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextSub
	s.nextSub++
	sub := subscriber{owner: owner, devices: make(chan []Device, 8), commands: make(chan Command, 8)}
	s.subs[id] = sub
	// A subscriber has missed every change made before it arrived, and only
	// changes are pushed: a speaker playing steadily produces none, so without
	// this first list a page that reloads mid-playback learns nothing until the
	// music stops.
	sub.devices <- forOwner(s.listLocked(), owner)
	return sub.devices, sub.commands, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if c, ok := s.subs[id]; ok {
			close(c.devices)
			close(c.commands)
			delete(s.subs, id)
		}
	}
}

func (s *Service) notify(list []Device) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, sub := range s.subs {
		select {
		case sub.devices <- forOwner(list, sub.owner):
		default:
		}
	}
}

func (s *Service) notifyOwner(owner string, list []Device) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, sub := range s.subs {
		if sub.owner != owner {
			continue
		}
		select {
		case sub.devices <- forOwner(list, owner):
		default:
		}
	}
}

func newDeviceID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		// A clock-based fallback is still unique enough for an in-memory registry.
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(buf)
}

func ipToID(ip string) string {
	out := []byte(ip)
	for i, c := range out {
		if c == '.' {
			out[i] = '-'
		}
	}
	return string(out)
}

// StreamURL builds the URL a Sonos player should fetch for a track. format is
// the transcode target, empty to hand the track over untouched. The host is the
// configured public URL, plainly: the speaker fetches it itself, and guessing a
// different address here would quietly paper over a wrong setting.
func (s *Service) StreamURL(trackID, token, format string) string {
	stream := strings.TrimRight(s.publicURL(), "/") + "/api/tracks/" + trackID + "/stream?token=" + url.QueryEscape(token)
	if format != "" {
		stream += "&transcode=" + url.QueryEscape(format)
	}
	return stream
}

// CoverURL builds the address a speaker fetches an album's artwork from. Like
// the stream, the speaker goes and gets it itself, so it has to be the public
// URL rather than whatever this server calls itself.
func (s *Service) CoverURL(albumID, filename string) string {
	if albumID == "" || filename == "" {
		return ""
	}
	return strings.TrimRight(s.publicURL(), "/") + "/api/albums/" + url.PathEscape(albumID) + "/cover"
}

// Reachable reports whether the configured public URL is one another machine
// can call back on. A loopback address is the default nobody thinks to change,
// and the reason a speaker stays silent with no error anywhere.
func (s *Service) Reachable() bool {
	parsed, err := url.Parse(strings.TrimRight(s.publicURL(), "/"))
	return err == nil && !isLoopbackHost(parsed.Hostname())
}

func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
