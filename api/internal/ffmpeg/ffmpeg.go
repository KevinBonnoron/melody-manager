// Package ffmpeg wraps the ffmpeg/ffprobe binaries (provided by the nix dev
// shell) for transcoding, probing and waveform-peak extraction.
package ffmpeg

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os/exec"
	"strconv"
	"strings"
)

// Format describes a transcode target (mirrors shared/configs/transcode.config).
type Format struct {
	MimeType string
	Args     []string
	// Whether the container has somewhere to put a cover. A player that fetches
	// a stream over HTTP often takes the artwork out of the file rather than out
	// of whatever metadata came with the request, so dropping it leaves a
	// speaker showing its own placeholder next to a track that has a cover.
	CarriesPicture bool
}

var formats = map[string]Format{
	"mp3":  {MimeType: "audio/mpeg", Args: []string{"-f", "mp3", "-ab", "320k", "-ar", "44100", "-ac", "2"}, CarriesPicture: true},
	"wav":  {MimeType: "audio/wav", Args: []string{"-f", "wav", "-ar", "44100", "-ac", "2"}},
	"flac": {MimeType: "audio/flac", Args: []string{"-f", "flac", "-compression_level", "5"}, CarriesPicture: true},
	"aac":  {MimeType: "audio/aac", Args: []string{"-f", "adts", "-c:a", "aac", "-b:a", "256k"}},
}

// pictureArgs carries the cover through, or drops it where the container has
// nowhere to put one. The map is optional, so a file with no cover transcodes
// the same either way; without the copy, ffmpeg would re-encode the artwork as
// a video stream and refuse the container.
func pictureArgs(format string, f Format) []string {
	if !f.CarriesPicture {
		return []string{"-vn"}
	}

	args := []string{"-map", "0:a", "-map", "0:v?", "-c:v", "copy"}
	if format == "mp3" {
		// The frame a cover lives in. Version 3 is what players agree on; the
		// default writes one many of them ignore.
		args = append(args, "-id3v2_version", "3")
	}
	return args
}

// extensions name the container each format is written into, for callers that
// need a file rather than a stream.
var extensions = map[string]string{"mp3": ".mp3", "wav": ".wav", "flac": ".flac", "aac": ".aac"}

// Extension returns the file extension a transcoded format is written with.
func Extension(format string) string {
	if ext, ok := extensions[format]; ok {
		return ext
	}
	return ".mp3"
}

// SaveTranscode writes the whole of input to outPath in the given format. A
// player can only seek in a response that has a length, which a pipe has not.
func SaveTranscode(ctx context.Context, input, format, outPath string) error {
	f, ok := formats[format]
	if !ok {
		f = formats["mp3"]
	}

	args := append([]string{"-y", "-i", input}, pictureArgs(format, f)...)
	args = append(args, f.Args...)
	args = append(args, outPath)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

// FormatFor returns the transcode format config, ok=false if unknown.
func FormatFor(name string) (Format, bool) {
	f, ok := formats[name]
	return f, ok
}

// ProbeDuration returns the media duration in seconds via ffprobe.
func ProbeDuration(ctx context.Context, input string) (float64, error) {
	out, err := exec.CommandContext(ctx, "ffprobe",
		"-v", "error", "-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1", input).Output()
	if err != nil {
		return 0, err
	}
	return strconv.ParseFloat(trimSpace(string(out)), 64)
}

// Peaks decodes mono s16le PCM and reduces it to num normalised peaks [0,1].
func Peaks(ctx context.Context, input string, num int) ([]float64, error) {
	cmd := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-i", input, "-ac", "1", "-f", "s16le", "-ar", "8000", "pipe:1")
	// Keep ffmpeg's own diagnostics: without them a failure surfaces as a bare
	// "exit status 8" and says nothing about why.
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	total := len(out) / 2
	if total == 0 || num <= 0 {
		return []float64{}, nil
	}
	block := total / num
	if block < 1 {
		block = 1
	}

	peaks := make([]float64, 0, num)
	for i := 0; i < num; i++ {
		var max float64
		start := i * block
		endIdx := start + block
		if endIdx > total {
			endIdx = total
		}
		for j := start; j < endIdx; j++ {
			s := int16(binary.LittleEndian.Uint16(out[j*2:]))
			v := math.Abs(float64(s)) / 32768
			if v > max {
				max = v
			}
		}
		peaks = append(peaks, max)
	}
	return peaks, nil
}

// SaveSegment writes input (a local file or URL) to outPath as MP3. When
// end > start it extracts only that [start, end] window (seconds), used to cut
// chapter tracks out of a single downloaded source. end <= start downloads the
// whole file.
func SaveSegment(ctx context.Context, input string, start, end float64, outPath string) error {
	args := []string{"-y"}
	if start > 0 {
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', -1, 64))
	}
	args = append(args, "-i", input)
	if end > start {
		args = append(args, "-t", strconv.FormatFloat(end-start, 'f', -1, 64))
	}
	args = append(args, "-vn", "-c:a", "libmp3lame", "-q:a", "2", outPath)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

// Tag is one metadata field written into the output container. A downloaded
// file is read back by the scanner and by whatever music player the operator
// points at the same folder, and both of them read tags, not file names.
type Tag struct {
	Name  string
	Value string
}

// SaveSegmentCopy writes [start, end] of input to outPath without re-encoding.
// The container is taken from outPath's extension, so callers keep the source
// extension: copying preserves quality and is far faster than an encode.
func SaveSegmentCopy(ctx context.Context, input string, start, end float64, outPath string, tags ...Tag) error {
	args := []string{"-y"}
	if start > 0 {
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', -1, 64))
	}
	args = append(args, "-i", input)
	if end > start {
		args = append(args, "-t", strconv.FormatFloat(end-start, 'f', -1, 64))
	}
	for _, tag := range tags {
		if tag.Value == "" {
			continue
		}
		args = append(args, "-metadata", tag.Name+"="+tag.Value)
	}
	args = append(args, "-vn", "-c:a", "copy", outPath)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r' || s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

// Audio describes what a file actually holds, as opposed to what its extension
// claims. A container a device accepts says nothing about the rate and depth
// inside it, and that is the half that makes a player give up.
type Audio struct {
	SampleRate int
	BitDepth   int
}

// ProbeAudio reads the first audio stream's rate and depth. Depth comes back
// zero for a lossy codec, which has none to report.
func ProbeAudio(ctx context.Context, input string) (Audio, error) {
	out, err := exec.CommandContext(ctx, "ffprobe",
		"-v", "error", "-select_streams", "a:0",
		"-show_entries", "stream=sample_rate,bits_per_raw_sample",
		"-of", "default=noprint_wrappers=1:nokey=1", input).Output()
	if err != nil {
		return Audio{}, err
	}

	fields := strings.Fields(string(out))
	if len(fields) == 0 {
		return Audio{}, errors.New("ffprobe: no audio stream")
	}

	audio := Audio{}
	audio.SampleRate, err = strconv.Atoi(fields[0])
	if err != nil {
		return Audio{}, err
	}
	if len(fields) > 1 {
		// "N/A" for a codec with no fixed depth, which is not an error.
		audio.BitDepth, _ = strconv.Atoi(fields[1])
	}

	return audio, nil
}
