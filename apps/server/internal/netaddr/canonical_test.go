package netaddr

import "testing"

func TestCanonical(t *testing.T) {
	cases := map[string]string{
		"0000:0000:0000:0000:0000:0000:0000:0001": "::1",
		"2001:0db8:0000:0000:0000:0000:0000:0001": "2001:db8::1",
		"0000:0000:0000:0000:0000:ffff:ac13:0001": "172.19.0.1",
		"192.168.1.20": "192.168.1.20",
		"":             "",
		"not-an-ip":    "not-an-ip",
	}
	for input, want := range cases {
		if got := Canonical(input); got != want {
			t.Errorf("Canonical(%q) = %q, want %q", input, got, want)
		}
	}
}
