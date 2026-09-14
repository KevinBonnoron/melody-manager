package ffmpeg

import (
	"slices"
	"testing"
)

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
