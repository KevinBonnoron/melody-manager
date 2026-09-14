package sonos

import "testing"

func TestDecodes(t *testing.T) {
	ok := []struct {
		rate, depth int
	}{
		{44100, 16},
		{48000, 24},
		{44100, 0},
	}
	for _, c := range ok {
		if !Decodes(c.rate, c.depth) {
			t.Errorf("Decodes(%d, %d) = false, want true", c.rate, c.depth)
		}
	}

	refused := []struct {
		rate, depth int
	}{
		{96000, 24},
		{192000, 24},
		{44100, 32},
		{0, 16},
	}
	for _, c := range refused {
		if Decodes(c.rate, c.depth) {
			t.Errorf("Decodes(%d, %d) = true, want false", c.rate, c.depth)
		}
	}
}
