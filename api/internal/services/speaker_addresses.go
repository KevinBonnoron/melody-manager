package services

import (
	"encoding/json"
	"net"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// SpeakerField is where speakers live: the Sonos source's own configuration,
// beside the music directory of one source and the download path of another.
// They used to sit in the operator's configuration file, which put a setting
// only somebody who owns a speaker sets next to the settings every deployment
// has.
const SpeakerField = "speakers"

// Speaker is one address and whether the server may use it.
//
// Two states rather than a bare list, because removing a speaker discovery can
// see achieves nothing: the next pass puts it straight back. Deleting an entry
// says "I do not have this", and discovery may well disagree tomorrow.
// Disabling one says "do not use this", which is the answer for a neighbour's
// speaker, or a room nobody casts to, and discovery must leave it alone.
type Speaker struct {
	Address string `json:"address"`
	Enabled bool   `json:"enabled"`
}

// ValidSpeakerAddress reports whether a speaker could be reached at this
// address at all. IPv4 only: discovery is SSDP and control is UPnP, both over
// IPv4, so anything else would sit in the list failing every attempt with
// nothing to say why.
func ValidSpeakerAddress(address string) bool {
	address = strings.TrimSpace(address)
	// To4 answers for a mapped address too, so "::ffff:192.0.2.1" passed and was
	// stored as written. Discovery reports dotted quads, so the two never match
	// and the entry sits there answering for a speaker it can never be.
	if strings.Contains(address, ":") {
		return false
	}
	ip := net.ParseIP(address)
	return ip != nil && ip.To4() != nil
}

// SpeakerAddresses reads and writes the speakers a server knows about, whether
// discovery found them or somebody typed them in. Both end up in the same place,
// so there is one list rather than two.
type SpeakerAddresses struct {
	app core.App
}

func NewSpeakerAddresses(app core.App) *SpeakerAddresses {
	return &SpeakerAddresses{app: app}
}

// KnownSpeakers lists the addresses worth trying directly when discovery, which
// is multicast and does not cross a bridged network, comes back empty. Only the
// enabled ones: a disabled speaker is one the operator has said to leave alone.
func (s *SpeakerAddresses) KnownSpeakers() []string {
	var out []string
	for _, speaker := range s.list() {
		if speaker.Enabled {
			out = append(out, speaker.Address)
		}
	}
	return out
}

// SpeakerUsable reports whether the server may play to this address. The kind
// has to be in service, and the speaker has to be one somebody decided to use:
// discovery runs whatever the operator wants, so that a speaker appearing on the
// network can be offered to them, and finding one is not the same as agreeing to
// play to it.
func (s *SpeakerAddresses) SpeakerUsable(address string) bool {
	if !s.enabled() {
		return false
	}

	for _, speaker := range s.list() {
		if speaker.Address == address {
			return speaker.Enabled
		}
	}

	return false
}

func (s *SpeakerAddresses) enabled() bool {
	rec, err := s.app.FindFirstRecordByFilter("provider_settings", "type = {:t}", dbx.Params{"t": "sonos"})
	if err != nil {
		return false
	}
	return rec.GetBool("enabled")
}

func (s *SpeakerAddresses) list() []Speaker {
	rec, err := s.app.FindFirstRecordByFilter("provider_config", "type = {:t}", dbx.Params{"t": "sonos"})
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
