package services

import (
	"encoding/json"
	"net"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// SpeakerField is where speakers live: the Sonos source's own configuration, beside the music
// directory of one source and the download path of another.
const SpeakerField = "speakers"

// Speaker is one address and whether the server may use it.
type Speaker struct {
	Address string `json:"address"`
	Enabled bool   `json:"enabled"`
}

// ValidSpeakerAddress reports whether a speaker could be reached at this address at all.
func ValidSpeakerAddress(address string) bool {
	address = strings.TrimSpace(address)
	if strings.Contains(address, ":") {
		return false
	}
	ip := net.ParseIP(address)
	return ip != nil && ip.To4() != nil
}

// SpeakerAddresses reads what the operator decided about the speakers of one kind of device or
// another.
type SpeakerAddresses struct {
	app core.App
}

func NewSpeakerAddresses(app core.App) *SpeakerAddresses {
	return &SpeakerAddresses{app: app}
}

// KnownSpeakers lists the addresses worth trying directly when discovery, which is multicast
// and does not cross a bridged network, comes back empty.
func (s *SpeakerAddresses) KnownSpeakers(kind string) []string {
	var out []string
	for _, speaker := range s.list(kind) {
		if speaker.Enabled {
			out = append(out, speaker.Address)
		}
	}
	return out
}

// SpeakerUsable reports whether the server may play to this address.
func (s *SpeakerAddresses) SpeakerUsable(kind, address string) bool {
	if !s.enabled(kind) {
		return false
	}

	for _, speaker := range s.list(kind) {
		if speaker.Address == address {
			return speaker.Enabled
		}
	}

	return false
}

func (s *SpeakerAddresses) enabled(kind string) bool {
	rec, err := s.app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": kind})
	if err != nil {
		return false
	}
	return rec.GetBool("enabled")
}

func (s *SpeakerAddresses) list(kind string) []Speaker {
	rec, err := s.app.FindFirstRecordByFilter("provider_config", "type = {:t}", dbx.Params{"t": kind})
	if err != nil {
		return nil
	}

	var cfg map[string]any
	if err := rec.UnmarshalJSONField("config", &cfg); err != nil {
		return nil
	}
	raw, err := json.Marshal(cfg[SpeakerField])
	if err != nil {
		return nil
	}

	var speakers []Speaker
	_ = json.Unmarshal(raw, &speakers)
	return speakers
}
