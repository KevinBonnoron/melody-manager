package ffmpeg

import (
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
)

// silentFLAC writes a file with no cover, which is the case the optional map
// exists for.
func silentFLAC(t *testing.T, dir string) string {
	t.Helper()
	path := dir + "/silence.flac"
	run(t, "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "flac", path)
	return path
}

// coveredFLAC writes a file that does carry one, which is the only input that
// can tell a transcode keeping the cover from one dropping it.
func coveredFLAC(t *testing.T, dir string) string {
	t.Helper()
	cover := dir + "/cover.jpg"
	run(t, "-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1", cover)

	path := dir + "/covered.flac"
	run(t, "-i", silentFLAC(t, dir), "-i", cover, "-map", "0:a", "-map", "1:v", "-c", "copy", "-disposition:v:0", "attached_pic", path)
	return path
}

func run(t *testing.T, args ...string) {
	t.Helper()
	cmd := exec.CommandContext(t.Context(), "ffmpeg", append([]string{"-v", "error", "-y"}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("ffmpeg unavailable or unwilling: %v: %s", err, out)
	}
}

// hasAttachedPicture asks ffprobe rather than trusting the size.
func hasAttachedPicture(t *testing.T, path string) bool {
	t.Helper()
	out, err := exec.CommandContext(t.Context(), "ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream_disposition=attached_pic", "-of", "default=nw=1:nk=1", path).Output()
	if err != nil {
		t.Fatalf("ffprobe: %v", err)
	}
	return strings.Contains(string(out), "1")
}

// A cover embedded in a file is a video stream as far as ffmpeg is concerned,
// so "-vn" threw it away on every transcode. A speaker fetching the stream over
// HTTP takes its artwork out of the file, and showed its own placeholder for a
// track that had a cover all along.
func TestPictureIsCarriedWhereTheContainerTakesOne(t *testing.T) {
	for _, format := range []string{"mp3", "flac"} {
		args := pictureArgs(format, formats[format])
		if slices.Contains(args, "-vn") {
			t.Errorf("%s drops the cover: %v", format, args)
		}
		if !slices.Contains(args, "copy") {
			t.Errorf("%s re-encodes the cover instead of copying it: %v", format, args)
		}
		// Optional, or a file with no cover would fail to transcode at all.
		if !slices.Contains(args, "0:v?") {
			t.Errorf("%s requires a cover rather than taking one if there is one: %v", format, args)
		}
	}
}

// wav and adts have nowhere to put one, and asking ffmpeg to copy a picture
// into them fails the whole transcode.
func TestPictureIsDroppedWhereItCannotGo(t *testing.T) {
	for _, format := range []string{"wav", "aac"} {
		if args := pictureArgs(format, formats[format]); !slices.Contains(args, "-vn") {
			t.Errorf("%s was asked to carry a cover: %v", format, args)
		}
	}
}

// Players disagree about later versions, and the default writes one many ignore.
func TestMP3AsksForTheTagVersionPlayersAgreeOn(t *testing.T) {
	args := pictureArgs("mp3", formats["mp3"])
	i := slices.Index(args, "-id3v2_version")
	if i < 0 || i+1 >= len(args) || args[i+1] != "3" {
		t.Errorf("mp3 args = %v", args)
	}
	if slices.Contains(pictureArgs("flac", formats["flac"]), "-id3v2_version") {
		t.Error("flac was given an id3 option, which it has no use for")
	}
}

// An unknown format falls back to mp3, and the name has to fall back with the
// arguments: asked about the original name, pictureArgs left out the tag version
// players agree on and the cover went into an mp3 nothing would read it from.
//
// The input has to carry a cover, or this passes just as well against the bug it
// exists for: an audio-only file transcodes either way.
func TestAnUnknownFormatFallsBackWholly(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.mp3"
	if err := SaveTranscode(t.Context(), coveredFLAC(t, dir), "ogg", out); err != nil {
		t.Fatalf("SaveTranscode: %v", err)
	}

	if !hasAttachedPicture(t, out) {
		t.Error("the cover did not survive the fallback")
	}

	// ID3v2.3 is what the arguments ask for, and reading the header is the only
	// way to see that they were asked for: the picture survives either version.
	header, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("reading the output: %v", err)
	}
	if len(header) < 4 || string(header[:3]) != "ID3" {
		t.Fatalf("no ID3 header at the start: %q", header[:min(len(header), 8)])
	}
	if header[3] != 3 {
		t.Errorf("ID3v2.%d, want ID3v2.3, so the fallback kept the original format name", header[3])
	}
}

// The same, for a format that is not a fallback, so the assertion above is
// known to be one the working path satisfies.
func TestMP3KeepsTheCoverAndTheTagVersion(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.mp3"
	if err := SaveTranscode(t.Context(), coveredFLAC(t, dir), "mp3", out); err != nil {
		t.Fatalf("SaveTranscode: %v", err)
	}
	if !hasAttachedPicture(t, out) {
		t.Error("the cover did not survive")
	}
}
