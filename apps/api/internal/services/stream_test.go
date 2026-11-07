package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// A track record carries an operator-supplied path, so anything outside the configured music
// directory must not resolve to a servable file.
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

	if _, ok := withinRoot("", inside); ok {
		t.Error(`withinRoot("", inside) = true, want false`)
	}
}

// Track records carry an operator-supplied absolute path, so the guard that keeps playback
// inside the configured directories is the one worth pinning.
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

// heldAddress is a resolver that hands out the address it holds and resolves a
// new one only once it has been told to forget.
type heldAddress struct {
	resolved int
	forgot   int
}

func (h *heldAddress) ResolveStream(_ context.Context, _ string, _ providers.Config) (*providers.Stream, error) {
	h.resolved++
	return &providers.Stream{Kind: "url", URL: fmt.Sprintf("https://host/audio?n=%d", h.resolved)}, nil
}

func (h *heldAddress) ForgetStream(_ string, _ providers.Config) { h.forgot++ }

func TestARefusedAddressIsDroppedAndResolvedOnceMore(t *testing.T) {
	held := &heldAddress{}
	var used []string

	err := onceMore(context.Background(), held, "https://source/track", nil, func(st *providers.Stream) error {
		used = append(used, st.URL)
		if len(used) == 1 {
			return refusal{status: http.StatusForbidden}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if held.forgot != 1 || held.resolved != 2 {
		t.Fatalf("forgot %d times and resolved %d", held.forgot, held.resolved)
	}
	if len(used) != 2 || used[0] == used[1] {
		t.Fatalf("the second attempt used %v", used)
	}
}

func TestARefusalTheSecondTimeIsAboutTheTrack(t *testing.T) {
	held := &heldAddress{}
	tries := 0

	err := onceMore(context.Background(), held, "https://source/track", nil, func(*providers.Stream) error {
		tries++
		return refusal{status: http.StatusForbidden}
	})
	if !refused(err) {
		t.Fatalf("err = %v", err)
	}
	if tries != 2 || held.forgot != 1 {
		t.Fatalf("tried %d times after forgetting %d", tries, held.forgot)
	}
}

func TestAFailureThatIsNotARefusalIsNotRetried(t *testing.T) {
	held := &heldAddress{}
	broken := errors.New("ffmpeg died")

	err := onceMore(context.Background(), held, "https://source/track", nil, func(*providers.Stream) error {
		return broken
	})
	if !errors.Is(err, broken) {
		t.Fatalf("err = %v", err)
	}
	if held.forgot != 0 || held.resolved != 1 {
		t.Fatalf("forgot %d times and resolved %d", held.forgot, held.resolved)
	}
}

// keptAddress holds nothing, so there is nothing to drop and nothing to gain
// from asking again.
type keptAddress struct{ resolved int }

func (k *keptAddress) ResolveStream(_ context.Context, _ string, _ providers.Config) (*providers.Stream, error) {
	k.resolved++
	return &providers.Stream{Kind: "url", URL: "https://host/audio"}, nil
}

func TestAResolverThatHoldsNothingIsNotAskedTwice(t *testing.T) {
	kept := &keptAddress{}
	err := onceMore(context.Background(), kept, "https://source/track", nil, func(*providers.Stream) error {
		return refusal{status: http.StatusForbidden}
	})
	if !refused(err) {
		t.Fatalf("err = %v", err)
	}
	if kept.resolved != 1 {
		t.Fatalf("resolved %d times", kept.resolved)
	}
}

func TestOnlyTheAnswersThatMeanTheAddressIsNoGoodAreRefusals(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusGone} {
		if !turnedDown(status) {
			t.Errorf("%d is not read as a refusal", status)
		}
	}
	for _, status := range []int{http.StatusOK, http.StatusPartialContent, http.StatusNotFound, http.StatusTooManyRequests, http.StatusInternalServerError} {
		if turnedDown(status) {
			t.Errorf("%d is read as a refusal", status)
		}
	}
}

func TestWhatWentWrongIsNamed(t *testing.T) {
	for _, c := range []struct {
		what   string
		source string
		err    error
		code   string
		status int
	}{
		{"a refusal", "youtube", refusal{status: http.StatusForbidden}, codeSourceRefused, http.StatusForbidden},
		{"a refusal wrapped on the way up", "youtube", fmt.Errorf("cutting the track out of the source: %w", refusal{status: http.StatusGone}), codeSourceRefused, http.StatusForbidden},
		{"a source asking to be signed in to", "youtube", errors.New("resolve stream: Sign in to confirm you are not a bot"), codeCookiesRequired, http.StatusForbidden},
		{"a source wanting an application", "spotify", errors.New("resolve stream: invalid client credentials"), codeCredentialsRequired, http.StatusForbidden},
		{"anything else", "youtube", errors.New("ffmpeg: Invalid data found when processing input"), codePlaybackFailed, http.StatusInternalServerError},
	} {
		code, status := streamCode(c.source, c.err)
		if code != c.code || status != c.status {
			t.Errorf("%s: %s/%d, want %s/%d", c.what, code, status, c.code, c.status)
		}
	}
}

func TestAFailureNeverAnswersInItsOwnWords(t *testing.T) {
	secrets := []string{
		"/srv/music/Someone/Album/01 - Track.flac",
		"https://rr3---sn-x.googlevideo.com/videoplayback?expire=1758400000&ei=secret",
		"/tmp/ytcookies-92831.txt",
	}
	named := map[string]bool{codeSourceRefused: true, codePlaybackFailed: true, codeCookiesRequired: true, codeCredentialsRequired: true}

	for _, secret := range secrets {
		code, _ := streamCode("youtube", fmt.Errorf("ffmpeg died on %s", secret))
		if !named[code] {
			t.Fatalf("%q is not one of the names", code)
		}
		if strings.Contains(code, secret) {
			t.Fatalf("the answer carries %q", secret)
		}
	}
}
