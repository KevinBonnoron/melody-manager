package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
)

// The players read from standard input unless a container requires seeking.
// The session token stays in the HTTP request rather than the process list.
var players = []struct {
	name string
	args []string
}{
	{"mpv", []string{"--no-video", "--really-quiet", "--no-terminal", "-"}},
	{"ffplay", []string{"-nodisp", "-autoexit", "-loglevel", "error", "-i", "-"}},
}

func findPlayer() (string, []string, error) {
	for _, candidate := range players {
		if path, err := exec.LookPath(candidate.name); err == nil {
			return path, candidate.args, nil
		}
	}

	names := make([]string, 0, len(players))
	for _, candidate := range players {
		names = append(names, candidate.name)
	}
	return "", nil, fmt.Errorf("no audio player found: install one of %s", strings.Join(names, ", "))
}

// stream opens the track's audio. The request carries the session token as a
// header, so nothing sensitive ends up in the process list.
func (c *client) stream(ctx context.Context, trackID string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.server+"/api/tracks/"+trackID+"/stream", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	// The API client's timeout also covers reading the response body. A track
	// can play for much longer, so retain its transport without that deadline.
	streamClient := *c.http
	streamClient.Timeout = 0
	res, err := streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		defer res.Body.Close()
		data, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		failure := &apiError{Status: res.StatusCode}
		if json.Unmarshal(data, failure) != nil {
			failure.Message = strings.TrimSpace(string(data))
		}
		return nil, failure
	}

	return res.Body, nil
}
