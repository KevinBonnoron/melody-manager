package services

import (
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func localTypeFixture(t *testing.T, tags ...string) (*regroupFixture, *core.Record, *core.Record, string) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
	f := newRegroupFixture(t)
	album := f.album("Local release")
	track := f.track(album, "Song", nil)
	path := filepath.Join(f.root, "song.flac")
	args := []string{"-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "flac"}
	for _, tag := range tags {
		args = append(args, "-metadata", tag)
	}
	args = append(args, path)
	if out, err := exec.CommandContext(t.Context(), "ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("creating local audio fixture: %v: %s", err, out)
	}
	track.Set("source", "local")
	track.Set("origin", "file://"+path)
	track.Set("duration", 1800)
	track.Set("metadata", map[string]any{"measuredFrom": 0})
	f.save(track)
	return f, album, track, path
}

func TestKnownFileDurationRefreshesAlbumType(t *testing.T) {
	for _, locked := range []bool{false, true} {
		t.Run(map[bool]string{false: "automatic", true: "chosen"}[locked], func(t *testing.T) {
			f, album, track, path := localTypeFixture(t)
			album.Set("type", "mix")
			album.Set("typeLocked", locked)
			f.save(album)

			if err := remeasureChanged(t.Context(), f.app, path, track.GetString("origin")); err != nil {
				t.Fatal(err)
			}
			fresh, err := f.app.FindRecordById("albums", album.Id)
			if err != nil {
				t.Fatal(err)
			}
			want := "single"
			if locked {
				want = "mix"
			}
			if got := fresh.GetString("type"); got != want {
				t.Fatalf("type = %q, want %q", got, want)
			}
		})
	}
}

func TestKnownFileTrackCountRefreshesAlbumType(t *testing.T) {
	f, album, track, path := localTypeFixture(t, "track=1", "tracktotal=8")
	track.Set("duration", 60)
	f.save(track)
	album.Set("type", "single")
	f.save(album)

	if err := numberKnownTrack(f.app, path, track.GetString("origin")); err != nil {
		t.Fatal(err)
	}
	fresh, err := f.app.FindRecordById("albums", album.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := fresh.GetString("type"); got != "album" {
		t.Fatalf("type after discovering eight tracks = %q, want album", got)
	}
}
