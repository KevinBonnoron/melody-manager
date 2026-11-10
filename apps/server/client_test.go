package main

import "testing"

// The compiled-in client is what makes the binary the whole application, and it
// still has to lose to a directory named outright: PUBLIC_DIR is how someone
// serves a bundle of their own, and a release binary that ignored it would
// leave the option documented and dead.
func TestUseEmbeddedClient(t *testing.T) {
	cases := []struct {
		name           string
		publicDirNamed bool
		goRun          bool
		compiledIn     bool
		want           bool
	}{
		{"a release binary", false, false, true, true},
		{"a release binary with PUBLIC_DIR set", true, false, true, false},
		{"a checkout whose client was never built", false, false, false, false},
		{"go run, where the compiled-in copy would be stale", false, true, true, false},
		{"go run with PUBLIC_DIR set", true, true, true, false},
	}
	for _, c := range cases {
		if got := useEmbeddedClient(c.publicDirNamed, c.goRun, c.compiledIn); got != c.want {
			t.Errorf("%s: useEmbeddedClient(%v, %v, %v) = %v, want %v", c.name, c.publicDirNamed, c.goRun, c.compiledIn, got, c.want)
		}
	}
}
