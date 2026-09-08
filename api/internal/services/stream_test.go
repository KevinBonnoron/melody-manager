package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// A track record carries an operator-supplied path, so anything outside the
// configured music directory must not resolve to a servable file.
func TestWithinRoot(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()

	nested := filepath.Join(root, "artist", "album")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	inside := filepath.Join(nested, "track.mp3")
	if err := os.WriteFile(inside, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(outside, "secret")
	if err := os.WriteFile(secret, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, ok := withinRoot(root, inside); !ok {
		t.Errorf("withinRoot(root, %q) = false, want true", inside)
	}
	for _, p := range []string{
		secret,
		filepath.Join(root, "..", filepath.Base(outside), "secret"),
		"/etc/shadow",
		"",
	} {
		if _, ok := withinRoot(root, p); ok {
			t.Errorf("withinRoot(root, %q) = true, want false", p)
		}
	}

	// With no configured directory nothing local is servable.
	if _, ok := withinRoot("", inside); ok {
		t.Error(`withinRoot("", inside) = true, want false`)
	}
}

func TestLocalInputRejectsPathsOutsideRoot(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "track.mp3")
	if err := os.WriteFile(inside, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := localInput(domain.TrackMetadata{LocalPath: inside}, "", root); got == "" {
		t.Error("localInput rejected a file inside the configured root")
	}
	if got := localInput(domain.TrackMetadata{LocalPath: "/etc/shadow"}, "", root); got != "" {
		t.Errorf("localInput(/etc/shadow) = %q, want \"\"", got)
	}
	if got := localInput(domain.TrackMetadata{}, "file:///etc/shadow", root); got != "" {
		t.Errorf("localInput(file:///etc/shadow) = %q, want \"\"", got)
	}
}
