package services

import (
	"os"
	"path/filepath"
	"testing"
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

// Track records carry an operator-supplied absolute path, so the guard that
// keeps playback inside the configured directories is the one worth pinning:
// without it any readable file on the host could be streamed.
func TestWithinRootAcceptsAnyConfiguredRoot(t *testing.T) {
	music := t.TempDir()
	downloads := t.TempDir()
	elsewhere := t.TempDir()

	inDownloads := filepath.Join(downloads, "track.mp3")
	if err := os.WriteFile(inDownloads, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	stray := filepath.Join(elsewhere, "track.mp3")
	if err := os.WriteFile(stray, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if !resolvesUnderAnyRoot(inDownloads, []string{music, downloads}) {
		t.Error("a file under the download path was rejected")
	}
	if resolvesUnderAnyRoot(stray, []string{music, downloads}) {
		t.Error("a file outside every configured root was accepted")
	}
}

func TestWithinRootRejectsPathsOutside(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "track.mp3")
	if err := os.WriteFile(inside, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if !resolvesUnderAnyRoot(inside, []string{root}) {
		t.Error("a file inside the configured root was rejected")
	}
	if resolvesUnderAnyRoot("/etc/shadow", []string{root}) {
		t.Error("/etc/shadow was accepted")
	}
	if resolvesUnderAnyRoot(filepath.Join(root, "..", "..", "etc", "shadow"), []string{root}) {
		t.Error("a traversal out of the root was accepted")
	}
}

func resolvesUnderAnyRoot(path string, roots []string) bool {
	for _, root := range roots {
		if p, ok := withinRoot(root, path); ok && fileExists(p) {
			return true
		}
	}
	return false
}

func TestSameFormat(t *testing.T) {
	cases := []struct {
		input  string
		format string
		want   bool
	}{
		{"/music/a/b/track.mp3", "mp3", true},
		{"/music/a/b/track.MP3", "mp3", true},
		{"/music/a/b/track.flac", "mp3", false},
		{"https://example.com/audio.mp3", "mp3", false},
		{"", "mp3", false},
	}
	for _, c := range cases {
		if got := sameFormat(c.input, c.format); got != c.want {
			t.Errorf("sameFormat(%q, %q) = %v, want %v", c.input, c.format, got, c.want)
		}
	}
}

func TestMimeFor(t *testing.T) {
	cases := map[string]string{
		"flac": "audio/flac",
		".mp3": "audio/mpeg",
		"WAV":  "audio/wav",
		"m4a":  "audio/mp4",
		// An .ogg carries Vorbis or Opus and a speaker decodes only one of them.
		"ogg":  "",
		"opus": "",
		"":     "",
	}
	for format, want := range cases {
		if got := MimeFor(format); got != want {
			t.Errorf("MimeFor(%q) = %q, want %q", format, got, want)
		}
	}
}
