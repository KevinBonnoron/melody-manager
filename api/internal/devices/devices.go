// Package devices discovers and controls playback devices (Sonos) and exposes
// the live device list over SSE.
package devices

import (
	"context"
	"net/url"
	"sync"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/sonos"
)

// Device is the API shape consumed by the client (matches the shared SonosDevice).
type Device struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Status    string         `json:"status"`
	Metadata  map[string]any `json:"metadata"`
	IPAddress string         `json:"ipAddress"`
	Volume    int            `json:"volume"`
	IsActive  bool           `json:"isActive"`
}

// Service maintains the device registry and notifies subscribers on changes.
type Service struct {
	serverURL string

	mu      sync.RWMutex
	devices map[string]Device // by id
	subs    map[int]chan []Device
	nextSub int
}

// New creates a device service. serverURL is the public base URL used to build
// stream URLs that Sonos players fetch.
func New(serverURL string) *Service {
	return &Service{serverURL: serverURL, devices: map[string]Device{}, subs: map[int]chan []Device{}}
}

// StartDiscovery polls SSDP every 10s and keeps the registry in sync.
func (s *Service) StartDiscovery() {
	go func() {
		for {
			s.discoverOnce()
			time.Sleep(10 * time.Second)
		}
	}()
}

func (s *Service) discoverOnce() {
	players := sonos.Discover(context.Background(), 2*time.Second)
	if len(players) == 0 {
		return
	}
	// Volumes are fetched before taking the lock: this is a blocking SOAP call
	// per speaker, and holding the write lock across it let one unresponsive
	// device block every reader — /api/devices, the SSE stream and each
	// per-device route — for as long as it stayed silent.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	volumes := make(map[string]int, len(players))
	for _, p := range players {
		volumes[p.IP] = sonos.GetVolume(ctx, p.IP)
	}
	cancel()

	s.mu.Lock()
	for _, p := range players {
		id := ipToID(p.IP)
		existing, ok := s.devices[id]
		status := "available"
		active := false
		if ok {
			status = existing.Status
			active = existing.IsActive
		}
		s.devices[id] = Device{
			ID: id, Name: p.Name, Type: "sonos", Status: status,
			IPAddress: p.IP, Volume: volumes[p.IP],
			IsActive: active, Metadata: map[string]any{"uuid": p.UUID, "roomName": p.Name},
		}
	}
	snapshot := s.listLocked()
	s.mu.Unlock()
	s.notify(snapshot)
}

// List returns a snapshot of known devices.
func (s *Service) List() []Device {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.listLocked()
}

func (s *Service) listLocked() []Device {
	out := make([]Device, 0, len(s.devices))
	for _, d := range s.devices {
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

// Subscribe returns a channel of device-list snapshots and an unsubscribe func.
func (s *Service) Subscribe() (<-chan []Device, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextSub
	s.nextSub++
	ch := make(chan []Device, 8)
	s.subs[id] = ch
	return ch, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if c, ok := s.subs[id]; ok {
			close(c)
			delete(s.subs, id)
		}
	}
}

func (s *Service) notify(list []Device) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ch := range s.subs {
		select {
		case ch <- list:
		default:
		}
	}
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

// StreamURL builds the URL a Sonos player should fetch for a track (forced mp3).
func (s *Service) StreamURL(trackID, token string) string {
	return s.serverURL + "/api/tracks/stream/" + trackID + "?transcode=mp3&token=" + url.QueryEscape(token)
}
