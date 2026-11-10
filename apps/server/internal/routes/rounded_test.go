package routes

import (
	"math"
	"testing"
)

// A seek target is a fraction of a second, because it comes from a click on a progress bar.
func TestRounded(t *testing.T) {
	cases := []struct {
		in   float64
		want int
	}{
		{40.7362, 41},
		{40.2, 40},
		{0, 0},
		{-5, 0},
		{math.NaN(), 0},
		{math.Inf(1), 0},
		{math.Inf(-1), 0},
	}
	for _, c := range cases {
		if got := rounded(c.in); got != c.want {
			t.Errorf("rounded(%v) = %d, want %d", c.in, got, c.want)
		}
	}
}
