package chromecast

import (
	"context"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

func TestSatisfiesPlayer(t *testing.T) {
	var _ players.Player = NewPlayer()
}

func TestAcceptsWhatAChromecastPlays(t *testing.T) {
	d := &Devices{}
	for _, mime := range []string{"audio/mpeg", "audio/flac", "AUDIO/MP4", " audio/wav "} {
		if !d.Accepts(context.Background(), "10.0.0.1", mime) {
			t.Errorf("Accepts(%q) = false, want true", mime)
		}
	}
	for _, mime := range []string{"", "audio/x-ms-wma", "video/mp4", "audio/alac"} {
		if d.Accepts(context.Background(), "10.0.0.1", mime) {
			t.Errorf("Accepts(%q) = true, want false", mime)
		}
	}
}

// One number for every model, and it is the one every model takes.
func TestDecodesWhatEveryModelTakes(t *testing.T) {
	d := &Devices{}
	ok := [][2]int{{44100, 16}, {48000, 24}, {44100, 0}}
	for _, c := range ok {
		if !d.Decodes(c[0], c[1]) {
			t.Errorf("Decodes(%d, %d) = false, want true", c[0], c[1])
		}
	}

	refused := [][2]int{{96000, 24}, {192000, 24}, {48000, 32}, {0, 16}}
	for _, c := range refused {
		if d.Decodes(c[0], c[1]) {
			t.Errorf("Decodes(%d, %d) = true, want false", c[0], c[1])
		}
	}
}

// The rest of the server speaks UPnP's words because Sonos got here first, so a Chromecast's
// own vocabulary has to be translated rather than passed through.
func TestTransportWordsMatchWhatTheServiceReads(t *testing.T) {
	for cast, want := range map[string]string{
		"PLAYING":   "PLAYING",
		"PAUSED":    "PAUSED_PLAYBACK",
		"BUFFERING": "TRANSITIONING",
		"IDLE":      "STOPPED",
		"":          "UNKNOWN",
	} {
		if got := transportWord(cast); got != want {
			t.Errorf("transportWord(%q) = %q, want %q", cast, got, want)
		}
	}
}

// A real device gives its id two ways: mDNS hands it over as bare hex, the setup endpoint as a
// hyphenated UUID of the same bytes.
func TestTheTwoWaysToLearnAnIDAgree(t *testing.T) {
	fromMDNS := "c3cc7e6d14454a172c3b9a2970bc0963"
	fromSetup := "c3cc7e6d-1445-4a17-2c3b-9a2970bc0963"

	if normaliseID(fromMDNS) != normaliseID(fromSetup) {
		t.Errorf("%q and %q are the same device: %q vs %q", fromMDNS, fromSetup, normaliseID(fromMDNS), normaliseID(fromSetup))
	}
	if normaliseID(fromMDNS) != fromMDNS {
		t.Errorf("the mDNS form was changed: %q", normaliseID(fromMDNS))
	}
}
