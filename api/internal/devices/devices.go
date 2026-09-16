// Package devices discovers and controls playback devices (Sonos) and exposes the live device
// list over SSE.
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
	Usable    bool           `json:"usable"`

	Session  string  `json:"session,omitempty"`
	Playing  bool    `json:"playing"`
	TrackID  string  `json:"trackId"`
	Position float64 `json:"position"`

	owner      string
	epoch      uint64
	reportedAt time.Time
}

const speakerPollInterval = 5 * time.Second

const speakerIdlePolls = 6

type speakerWatch struct{ nudge chan struct{} }

// WatchSpeaker keeps a speaker's reported state fresh for as long as it plays, and pushes it to
// every client over the stream they already listen on.
func (s *Service) WatchSpeaker(id string) {
	watch := &speakerWatch{nudge: make(chan struct{}, 1)}
	if existing, running := s.watching.LoadOrStore(id, watch); running {
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

// SetPlaybackStore is wired once the database is available, which is after the registry itself
// exists.
func (s *Service) SetPlaybackStore(store PlaybackStore) {
	s.mu.Lock()
	s.playback = store
	s.mu.Unlock()
}

// SetPlayers hands the service the protocols it can speak.
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

// Speaks reports whether this server reaches a kind of device over the network, for the routes,
// which have to tell that from a client of the user's own.
func (s *Service) Speaks(kind string) bool { return s.speaks(kind) }

func (s *Service) speaks(kind string) bool {
	_, ok := s.registry().For(kind)
	return ok
}

// PlayerFor answers which protocol a device speaks, for the routes, which have to reach the
// device directly to hand it a track or move it.
func (s *Service) PlayerFor(device Device) (players.Player, bool) {
	return s.playerFor(device)
}

func (s *Service) playerFor(device Device) (players.Player, bool) {
	return s.registry().For(device.Type)
}

// SetSpeakerStore hands the service where speaker addresses live.
func (s *Service) SetSpeakerStore(store SpeakerStore) {
	s.mu.Lock()
	s.speakers = store
	s.mu.Unlock()
}

// SetSpeakerTrack records what a speaker was told to play, and for whom.
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

	playing = state != "STOPPED" && state != "PAUSED_PLAYBACK" && state != "UNKNOWN"
	if playing && device.TrackID == "" {
		s.SetSpeakerTrack(id, "", trackFromStreamURL(player.CurrentURL(ctx, device.IPAddress)))
	}

	s.reportSpeaker(id, playing, float64(position), volume)
	return playing, float64(duration - position), true
}

const speakerPollTimeout = 5 * time.Second

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

// PlaybackStore records where a user's playback got to.
type PlaybackStore interface {
	SavePosition(owner, trackID string, position float64) error
}

// SpeakerStore holds what the operator decided about each speaker.
type SpeakerStore interface {
	KnownSpeakers(kind string) []string
	SpeakerUsable(kind, address string) bool
}

// Service maintains the device registry and notifies subscribers on changes.
type Service struct {
	publicURL func() string

	watching sync.Map // speaker id -> *speakerWatch

	playback PlaybackStore

	playersMu sync.RWMutex
	players   players.Registry

	mu        sync.RWMutex
	devices   map[string]Device // by id
	subs      map[int]subscriber
	nextSub   int
	nextEpoch uint64
	speakers  SpeakerStore

	sessions map[string]string
}

type subscriber struct {
	owner    string
	devices  chan []Device
	commands chan Command
}

// New creates a device service.
func New(publicURL func() string) *Service {
	return &Service{publicURL: publicURL, devices: map[string]Device{}, subs: map[int]subscriber{}, sessions: map[string]string{}}
}

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
				s.refreshUsable()
			}
		}
	}()
}

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

const positionJumpTolerance = 2.0

var clientTypes = map[string]bool{"browser": true, "mobile": true, "desktop": true}

// RegisterClient declares one open client of a user.
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

// ReportState records what a client is doing.
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

// UnregisterClient drops a client whose stream has ended.
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

func (s *Service) discoverKind(player players.Player) {
	ctx := context.Background()
	kind := player.Kind()
	found := player.Discover(ctx, 2*time.Second)

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

	volumeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	volumes := make(map[string]int, len(found))
	for _, device := range found {
		volumes[device.Address] = player.Volume(volumeCtx, device.Address)
	}
	cancel()

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
	if state := player.Transport(ctx, device.IPAddress); state != "PLAYING" && state != "TRANSITIONING" {
		return
	}

	s.SetSpeakerTrack(id, "", trackFromStreamURL(player.CurrentURL(ctx, device.IPAddress)))
	s.WatchSpeaker(id)
}

func trackFromStreamURL(uri string) string {
	_, rest, found := strings.Cut(uri, tracksPathPrefix)
	if !found {
		return ""
	}

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

// StreamURL builds the URL a Sonos player should fetch for a track.
func (s *Service) StreamURL(trackID, token, format string) string {
	stream := strings.TrimRight(s.publicURL(), "/") + "/api/tracks/" + trackID + "/stream?token=" + url.QueryEscape(token)
	if format != "" {
		stream += "&transcode=" + url.QueryEscape(format)
	}
	return stream
}

// CoverURL builds the address a speaker fetches an album's artwork from.
func (s *Service) CoverURL(albumID, filename string) string {
	if albumID == "" || filename == "" {
		return ""
	}
	return strings.TrimRight(s.publicURL(), "/") + "/api/albums/" + url.PathEscape(albumID) + "/cover"
}

// Reachable reports whether the configured public URL is one another machine can call back on.
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
