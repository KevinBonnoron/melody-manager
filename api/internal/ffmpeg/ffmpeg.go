// Package ffmpeg wraps the ffmpeg/ffprobe binaries (provided by the nix dev
// shell) for transcoding, probing and waveform-peak extraction.
package ffmpeg

import (
	"context"
	"encoding/binary"
	"io"
	"math"
	"os/exec"
	"strconv"
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
	cmd := exec.CommandContext(ctx, "ffmpeg", "-i", input, "-ac", "1", "-f", "s16le", "-ar", "8000", "pipe:1")
	cmd.Stderr = io.Discard
	out, err := cmd.Output()
	if err != nil {
		return nil, err
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

func trimSpace(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r' || s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
