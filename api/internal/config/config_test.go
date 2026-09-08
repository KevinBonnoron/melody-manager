package config

import "testing"

// The configuration guide documents sizes as "1GB" / "5GB", so those forms have
// to parse rather than silently fall back to the default.
func TestEnvSize(t *testing.T) {
	const fallback = int64(42)
	cases := []struct {
		in   string
		want int64
	}{
		{"", fallback},
		{"1024", 1024},
		{"512KB", 512 << 10},
		{"512MB", 512 << 20},
		{"5GB", 5 << 30},
		{"2G", 2 << 30},
		{"1TB", 1 << 40},
		{" 3 gb ", 3 << 30},
		{"800B", 800},
		{"nonsense", fallback},
		{"-1", fallback},
	}
	for _, tc := range cases {
		t.Setenv("MELODY_TEST_SIZE", tc.in)
		if tc.in == "" {
			// An unset variable and an empty one both mean "use the default".
			t.Setenv("MELODY_TEST_SIZE", "")
		}
		if got := envSize("MELODY_TEST_SIZE", fallback); got != tc.want {
			t.Errorf("envSize(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
