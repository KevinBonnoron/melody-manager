package devices

import (
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

type speakerStoreStub struct {
	usable map[string]bool
}

func (s speakerStoreStub) KnownSpeakers(string) []string { return nil }

func (s speakerStoreStub) SpeakerUsable(_, address string) bool { return s.usable[address] }

// playerStub speaks a kind and nothing else: refreshUsable only asks the
// registry which devices it controls.
type playerStub struct{ players.Player }

func (playerStub) Kind() string { return "sonos" }

// A speaker that stops answering M-SEARCH is not probed directly either once it
// is disabled, so nothing would bring the registry back in line with the
// decision: it kept saying usable, and the control routes went on letting
// anybody play to it.
func TestRefreshUsableReachesSpeakersDiscoveryNoLongerFinds(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	svc.devices["silent"] = Device{ID: "silent", Type: "sonos", IPAddress: "10.0.0.9", Usable: true}
	svc.devices["client"] = Device{ID: "client", Type: "browser", Usable: true}
	svc.SetPlayers(players.Registry{"sonos": playerStub{}})
	svc.SetSpeakerStore(speakerStoreStub{usable: map[string]bool{}})

	svc.refreshUsable()

	if svc.devices["silent"].Usable {
		t.Error("a speaker nobody agreed to is still usable")
	}
	if !svc.devices["client"].Usable {
		t.Error("a client of one's own was made unusable")
	}
}

func TestRefreshUsablePutsASpeakerBack(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	svc.devices["speaker"] = Device{ID: "speaker", Type: "sonos", IPAddress: "10.0.0.9", Usable: false}
	svc.SetPlayers(players.Registry{"sonos": playerStub{}})
	svc.SetSpeakerStore(speakerStoreStub{usable: map[string]bool{"10.0.0.9": true}})

	svc.refreshUsable()

	if !svc.devices["speaker"].Usable {
		t.Error("a speaker put in service is still refused")
	}
}
