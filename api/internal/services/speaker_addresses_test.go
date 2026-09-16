package services

import (
	"testing"
)

// A speaker that answers discovery once has to survive the many passes where it stays silent,
// and one the operator switched off must not come back on the moment it answers again.
func TestValidSpeakerAddress(t *testing.T) {
	valid := []string{"192.168.10.119", "  10.0.0.1  ", "0.0.0.0"}
	for _, address := range valid {
		if !ValidSpeakerAddress(address) {
			t.Errorf("ValidSpeakerAddress(%q) = false, want true", address)
		}
	}

	invalid := []string{"", "ertgdfg", "192.168.10", "192.168.10.256", "fe80::1", "192.168.10.119:1400", "::ffff:192.0.2.1"}
	for _, address := range invalid {
		if ValidSpeakerAddress(address) {
			t.Errorf("ValidSpeakerAddress(%q) = true, want false", address)
		}
	}
}
