// Package ffmpeg wraps the ffmpeg/ffprobe binaries (provided by the nix dev
// shell) for transcoding, probing and waveform-peak extraction.
package ffmpeg

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os/exec"
	"strconv"
	"strings"
)

// Format describes a transcode target (mirrors shared/configs/transcode.config).
type Format struct {
	MimeType string
	Args     []string
}

var formats = map[string]Format{
	"mp3":  {MimeType: "audio/mpeg", Args: []string{"-f", "mp3", "-ab", "320k", "-ar", "44100", "-ac", "2"}},
	"wav":  {MimeType: "audio/wav", Args: []string{"-f", "wav", "-ar", "44100", "-ac", "2"}},
	"flac": {MimeType: "audio/flac", Args: []string{"-f", "flac", "-compression_level", "5"}},
	"aac":  {MimeType: "audio/aac", Args: []string{"-f", "adts", "-c:a", "aac", "-b:a", "256k"}},
}

// FormatFor returns the transcode format config, ok=false if unknown.
func FormatFor(name string) (Format, bool) {
	f, ok := formats[name]
	return f, ok
}

// streamReader couples ffmpeg's stdout with the process so Close kills it.
type streamReader struct {
	io.ReadCloser
	cmd *exec.Cmd
}

func (s *streamReader) Close() error {
	err := s.ReadCloser.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	_ = s.cmd.Wait()
	return err
}

// Transcode starts ffmpeg reading from input (file path or URL), optionally
// seeking to [start,end] seconds, and streams the chosen format to the
// returned reader. Close the reader to stop and reap the process.
func Transcode(ctx context.Context, input string, start, end float64, format string) (io.ReadCloser, string, error) {
	f, ok := formats[format]
	if !ok {
		f = formats["mp3"]
	}

	args := []string{}
	if start > 0 {
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', -1, 64))
	}
	if end > 0 {
		args = append(args, "-to", strconv.FormatFloat(end, 'f', -1, 64))
	}
	args = append(args, "-i", input)
	args = append(args, f.Args...)
	args = append(args, "pipe:1")

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, "", err
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		return nil, "", err
	}
	return &streamReader{ReadCloser: stdout, cmd: cmd}, f.MimeType, nil
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
// end > start it extracts only that [start, end] window (seconds) — used to cut
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

// SaveSegmentCopy writes [start, end] of input to outPath without re-encoding.
// The container is taken from outPath's extension, so callers keep the source
// extension: copying preserves quality and is far faster than an encode.
func SaveSegmentCopy(ctx context.Context, input string, start, end float64, outPath string) error {
	args := []string{"-y"}
	if start > 0 {
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', -1, 64))
	}
	args = append(args, "-i", input)
	if end > start {
		args = append(args, "-t", strconv.FormatFloat(end-start, 'f', -1, 64))
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
