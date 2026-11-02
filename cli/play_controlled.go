package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// PlaybackEvent describes state reported by the player, not elapsed wall time.
type PlaybackEvent struct {
	Position float64
	Paused   bool
	Ready    bool
}

func ffplayStartArguments(args []string, position float64) []string {
	insertAt := len(args) - 1
	for i, arg := range args {
		if arg == "-i" {
			insertAt = i
			break
		}
	}
	args = append(args, "", "")
	copy(args[insertAt+2:], args[insertAt:])
	args[insertAt] = "-ss"
	args[insertAt+1] = strconv.FormatFloat(position, 'f', 3, 64)
	return args
}

// playTrackControlled plays one track, accepting requested pause states even
// while the stream or its seekable local copy is still loading. Events are
// best-effort snapshots; a slow consumer must not block player shutdown.
func playTrackControlled(ctx context.Context, c *client, trackID string, startPosition float64, startPaused bool, controls <-chan bool, events chan<- PlaybackEvent) error {
	binary, args, err := findPlayer()
	if err != nil {
		return err
	}

	var requested atomic.Bool
	requested.Store(startPaused)
	changed := make(chan struct{}, 1)
	controlCtx, stopControls := context.WithCancel(ctx)
	controlDone := make(chan struct{})
	go func() {
		defer close(controlDone)
		for {
			select {
			case <-controlCtx.Done():
				return
			case paused, ok := <-controls:
				if !ok {
					return
				}
				requested.Store(paused)
				select {
				case changed <- struct{}{}:
				default:
				}
			}
		}
	}()
	defer func() { stopControls(); <-controlDone }()

	audio, err := c.stream(ctx, trackID)
	if err != nil {
		return err
	}
	defer audio.Close()
	input := bufio.NewReader(audio)
	header, err := input.Peek(12)
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	args = append([]string(nil), args...)
	var filename string
	isMP4 := len(header) >= 12 && bytes.Equal(header[4:8], []byte("ftyp"))
	if isMP4 || startPosition > 0 {
		suffix := ".audio"
		if isMP4 {
			suffix = ".mp4"
		}
		file, err := os.CreateTemp("", "melody-audio-*"+suffix)
		if err != nil {
			return err
		}
		filename = file.Name()
		defer os.Remove(filename)
		_, copyErr := io.Copy(file, input)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		args[len(args)-1] = filename
	}

	isMPV := filepath.Base(binary) == "mpv" || filepath.Base(binary) == "mpv.exe"
	var socket string
	if isMPV {
		if startPosition > 0 {
			args = append(args, "--start="+strconv.FormatFloat(startPosition, 'f', 3, 64))
		}
		dir, err := os.MkdirTemp("", "melody-mpv-*")
		if err != nil {
			return err
		}
		defer os.RemoveAll(dir)
		socket = filepath.Join(dir, "ipc")
		// Start paused to prevent audio escaping a pause requested while loading.
		args = append([]string{"--pause", "--input-ipc-server=" + socket}, args...)
	} else {
		if startPosition > 0 {
			args = ffplayStartArguments(args, startPosition)
		}
		// ffplay writes its media clock as carriage-return-delimited status lines.
		args = append([]string{"-stats", "-loglevel", "info"}, args...)
		// The original error-only log level would override the one above.
		for i := 0; i+1 < len(args); i++ {
			if args[i] == "-loglevel" {
				args[i+1] = "info"
			}
		}
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	var stderr bytes.Buffer
	var statusR *io.PipeReader
	var statusW *io.PipeWriter
	if isMPV {
		cmd.Stderr = &stderr
	} else {
		statusR, statusW = io.Pipe()
		cmd.Stderr = statusW
	}
	var stdin io.WriteCloser
	if filename == "" {
		stdin, err = cmd.StdinPipe()
		if err != nil {
			return err
		}
	}
	if err := cmd.Start(); err != nil {
		if statusR != nil {
			statusR.Close()
			statusW.Close()
		}
		return err
	}
	if !isMPV && startPaused {
		if err := setProcessPaused(cmd.Process, true); err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return fmt.Errorf("pause player: %w", err)
		}
	}
	if stdin != nil {
		go func() { _, _ = io.Copy(stdin, input); stdin.Close() }()
	}
	done := make(chan error, 1)
	go func() {
		err := cmd.Wait()
		if statusW != nil {
			statusW.Close()
		}
		done <- err
	}()
	var stateErr error
	if isMPV {
		stateErr = monitorMPV(ctx, cmd, socket, &requested, changed, events, done)
	} else {
		stateErr = monitorFFplay(ctx, cmd, statusR, &requested, changed, events, done)
		statusR.Close()
	}
	// The monitor returns only after consuming done, or after killing and
	// reaping the process itself. Closing the response unblocks the copy loop.
	audio.Close()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if stateErr != nil && stderr.Len() > 0 {
		return fmt.Errorf("%w: %s", stateErr, strings.TrimSpace(stderr.String()))
	}
	return stateErr
}

func sendPlaybackEvent(events chan<- PlaybackEvent, event PlaybackEvent) {
	select {
	case events <- event:
	default:
	}
}

// mpv's JSON IPC replies contain the decoder's actual time-pos and pause state.
func monitorMPV(ctx context.Context, cmd *exec.Cmd, socket string, requested *atomic.Bool, changed <-chan struct{}, events chan<- PlaybackEvent, done <-chan error) error {
	var conn net.Conn
	var reader *bufio.Reader
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	startup := time.NewTimer(5 * time.Second)
	defer startup.Stop()
	startupTimeout := startup.C
	defer func() {
		if conn != nil {
			conn.Close()
		}
	}()
	applied := true // mpv starts with --pause
	ready := false
	position := 0.0
	for {
		select {
		case err := <-done:
			return err
		case <-ctx.Done():
			return <-done
		case <-startupTimeout:
			cmd.Process.Kill()
			<-done
			return errors.New("mpv control socket did not become available")
		case <-changed:
		case <-ticker.C:
		}
		if conn == nil {
			var err error
			conn, err = net.DialTimeout("unix", socket, 100*time.Millisecond)
			if err != nil {
				conn = nil
				continue
			}
			startupTimeout = nil
			reader = bufio.NewReader(conn)
		}
		want := requested.Load()
		if want != applied {
			if _, err := mpvRequest(conn, reader, []any{"set_property", "pause", want}); err != nil {
				conn.Close()
				conn = nil
				continue
			}
			applied = want
		}
		value, err := mpvRequest(conn, reader, []any{"get_property", "time-pos"})
		if err != nil && !errors.Is(err, errMPVPropertyUnavailable) {
			conn.Close()
			conn = nil
			continue
		}
		if p, ok := value.(float64); ok && p >= 0 {
			position = p
			ready = true
		}
		value, err = mpvRequest(conn, reader, []any{"get_property", "pause"})
		if err != nil {
			conn.Close()
			conn = nil
			continue
		}
		if paused, ok := value.(bool); ok {
			applied = paused
		}
		sendPlaybackEvent(events, PlaybackEvent{Position: position, Paused: applied, Ready: ready})
	}
}

var errMPVPropertyUnavailable = errors.New("mpv property unavailable")

func mpvRequest(conn net.Conn, reader *bufio.Reader, command []any) (any, error) {
	if err := conn.SetDeadline(time.Now().Add(200 * time.Millisecond)); err != nil {
		return nil, err
	}
	request, err := json.Marshal(map[string]any{"command": command, "request_id": 1})
	if err != nil {
		return nil, err
	}
	if _, err = conn.Write(append(request, '\n')); err != nil {
		return nil, err
	}
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			return nil, err
		}
		var reply struct {
			RequestID int    `json:"request_id"`
			Data      any    `json:"data"`
			Error     string `json:"error"`
		}
		if json.Unmarshal(line, &reply) != nil || reply.RequestID != 1 {
			continue
		}
		// Unavailable properties while the file loads are not IPC failures.
		if reply.Error != "success" {
			return nil, fmt.Errorf("%w: %s", errMPVPropertyUnavailable, reply.Error)
		}
		return reply.Data, nil
	}
}
func monitorFFplay(ctx context.Context, cmd *exec.Cmd, status io.Reader, requested *atomic.Bool, changed <-chan struct{}, events chan<- PlaybackEvent, done <-chan error) error {
	positions := make(chan float64, 1)
	diagnostics := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(status)
		scanner.Split(splitPlayerStatus)
		var messages strings.Builder
		for scanner.Scan() {
			line := scanner.Text()
			if pos, ok := parseFFplayPosition(line); ok {
				select {
				case positions <- pos:
				default:
				}
			} else if messages.Len() < 8192 {
				messages.WriteString(line)
				messages.WriteByte('\n')
			}
		}
		// Keep draining if a malformed, oversized line stopped the scanner.
		if scanner.Err() != nil {
			_, _ = io.Copy(io.Discard, status)
		}
		diagnostics <- strings.TrimSpace(messages.String())
	}()
	paused, ready, position := requested.Load(), false, 0.0
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case err := <-done:
			message := <-diagnostics
			if err != nil && message != "" {
				return fmt.Errorf("%w: %s", err, message)
			}
			return err
		case <-ctx.Done():
			return <-done
		case position = <-positions:
			ready = true
		case <-changed:
		case <-ticker.C:
		}
		want := requested.Load()
		if want != paused {
			if err := setProcessPaused(cmd.Process, want); err != nil {
				cmd.Process.Kill()
				<-done
				return fmt.Errorf("pause player: %w", err)
			}
			paused = want
		}
		sendPlaybackEvent(events, PlaybackEvent{Position: position, Paused: paused, Ready: ready})
	}
}

func splitPlayerStatus(data []byte, atEOF bool) (int, []byte, error) {
	if i := bytes.IndexAny(data, "\r\n"); i >= 0 {
		return i + 1, data[:i], nil
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func parseFFplayPosition(line string) (float64, bool) {
	// Status lines contain the master clock followed by A-V, M-A, or M-V.
	fields := strings.Fields(line)
	if len(fields) < 2 || (fields[1] != "A-V:" && fields[1] != "M-A:" && fields[1] != "M-V:") {
		return 0, false
	}
	pos, err := strconv.ParseFloat(fields[0], 64)
	return pos, err == nil && pos >= 0
}
