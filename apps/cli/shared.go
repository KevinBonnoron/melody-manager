package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type sharedTime struct{ time.Time }

func (t *sharedTime) UnmarshalJSON(data []byte) error {
	if string(data) == `""` || string(data) == "null" {
		t.Time = time.Time{}
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		parsed, err = time.Parse("2006-01-02 15:04:05.999999999Z07:00", value)
	}
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}

type sharedState struct {
	Track      string     `json:"track"`
	Position   float64    `json:"position"`
	PositionAt sharedTime `json:"positionAt"`
	Began      sharedTime `json:"beganAt"`
	Playing    bool       `json:"playing"`
	Devices    []string   `json:"devices"`
	List       []string   `json:"list"`
	Order      []int      `json:"order"`
	Index      int        `json:"index"`
	Shuffle    bool       `json:"shuffle"`
	Repeat     string     `json:"repeat"`
	Now        sharedTime `json:"now"`
}

func (s sharedState) Cycle() int64 {
	if !s.Began.IsZero() {
		return s.Began.UnixMilli()
	}
	if !s.PositionAt.IsZero() {
		return s.PositionAt.UnixMilli()
	}
	return 0
}

type sharedEvent struct {
	kind     string
	deviceID string
	action   string
	state    sharedState
	err      error
}

// Only a realtime delivery re-arms the watcher. HTTP command responses remain
// sharedEvent values, so they cannot add another reader to the event channel.
type sharedStreamMsg struct{ event sharedEvent }

const (
	sharedRegistered   = "registered"
	sharedCommand      = "command"
	sharedStateChanged = "stateChanged"
	sharedFailed       = "failed"
)

// watchDevicePresence listens for commands addressed to this CLI player. The
// streaming request uses a copy of the API client without its usual deadline.
func watchDevicePresence(ctx context.Context, c *client, session, name string, out chan<- sharedEvent) {
	body := struct {
		Type    string `json:"type"`
		Session string `json:"session"`
		Name    string `json:"name"`
		Volume  int    `json:"volume"`
	}{Type: "cli", Session: session, Name: name, Volume: 100}

	for ctx.Err() == nil {
		err := sharedStream(ctx, c, http.MethodPost, "/api/events", body, func(event, data string) {
			switch event {
			case "registered":
				var device struct {
					ID string `json:"id"`
				}
				if err := json.Unmarshal([]byte(data), &device); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}
				emitShared(ctx, out, sharedEvent{kind: sharedRegistered, deviceID: device.ID})

				var state sharedState
				if err := c.get("/api/player", &state); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}
				emitShared(ctx, out, sharedEvent{kind: sharedStateChanged, state: state})
			case "command":
				var command struct {
					DeviceID string `json:"deviceId"`
					Action   string `json:"action"`
				}
				if err := json.Unmarshal([]byte(data), &command); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}
				emitShared(ctx, out, sharedEvent{
					kind:     sharedCommand,
					deviceID: command.DeviceID,
					action:   command.Action,
				})
			}
		})
		if ctx.Err() != nil {
			return
		}
		var failure *apiError
		if body.Type == "cli" && errors.As(err, &failure) && failure.Status == http.StatusBadRequest && strings.Contains(strings.ToLower(failure.Message), "unregisterable device type") {
			body.Type = "desktop"
			continue
		}
		if err != nil {
			emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
		}
		if !waitSharedRetry(ctx) {
			return
		}
	}
}

// watchSharedState follows PocketBase playback records after subscribing to
// their realtime changes.
func watchSharedState(ctx context.Context, c *client, out chan<- sharedEvent) {
	for ctx.Err() == nil {
		err := sharedStream(ctx, c, http.MethodGet, "/api/realtime", nil, func(event, data string) {
			if event == "PB_CONNECT" {
				var connection struct {
					ClientID string `json:"clientId"`
				}
				if err := json.Unmarshal([]byte(data), &connection); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}
				subscription := struct {
					ClientID      string   `json:"clientId"`
					Subscriptions []string `json:"subscriptions"`
				}{ClientID: connection.ClientID, Subscriptions: []string{"playback_state/*"}}
				if err := c.send(http.MethodPost, "/api/realtime", subscription, nil); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}

				var state sharedState
				if err := c.get("/api/player", &state); err != nil {
					emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
					return
				}
				emitShared(ctx, out, sharedEvent{kind: sharedStateChanged, state: state})
				return
			}

			var change struct {
				Action string          `json:"action"`
				Record json.RawMessage `json:"record"`
			}
			if err := json.Unmarshal([]byte(data), &change); err != nil {
				emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
				return
			}
			if change.Action == "delete" {
				emitShared(ctx, out, sharedEvent{kind: sharedStateChanged})
				return
			}
			var state sharedState
			if err := json.Unmarshal(change.Record, &state); err != nil {
				emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
				return
			}
			emitShared(ctx, out, sharedEvent{kind: sharedStateChanged, state: state})
		})
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			emitShared(ctx, out, sharedEvent{kind: sharedFailed, err: err})
		}
		if !waitSharedRetry(ctx) {
			return
		}
	}
}

func sharedOrder(c *client, path string, body any) sharedEvent {
	return sharedOrderContext(context.Background(), c, path, body)
}

func sharedOrderContext(ctx context.Context, c *client, path string, body any) sharedEvent {
	var state sharedState
	if err := c.sendContext(ctx, http.MethodPost, "/api/player/"+path, body, &state); err != nil {
		return sharedEvent{kind: sharedFailed, err: err}
	}
	return sharedEvent{kind: sharedStateChanged, state: state}
}

// sharedStream opens one SSE response and consumes it until EOF or cancellation.
func sharedStream(ctx context.Context, c *client, method, path string, body any, handle func(event, data string)) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.server+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	streamClient := *c.http
	streamClient.Timeout = 0
	res, err := streamClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		data, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		failure := &apiError{Status: res.StatusCode}
		if json.Unmarshal(data, failure) != nil || failure.Message == "" {
			failure.Message = strings.TrimSpace(string(data))
		}
		return failure
	}

	return readSharedEvents(res.Body, handle)
}

// readSharedEvents implements the SSE fields needed by the server, including
// multiline data and both LF and CRLF framing.
func readSharedEvents(r io.Reader, handle func(event, data string)) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	event := ""
	var data []string
	dispatch := func() {
		if len(data) == 0 {
			event = ""
			return
		}
		name := event
		if name == "" {
			name = "message"
		}
		handle(name, strings.Join(data, "\n"))
		event = ""
		data = nil
	}

	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			dispatch()
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, _ := strings.Cut(line, ":")
		if strings.HasPrefix(value, " ") {
			value = value[1:]
		}
		switch field {
		case "event":
			event = value
		case "data":
			data = append(data, value)
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	dispatch()
	return nil
}

func emitShared(ctx context.Context, out chan<- sharedEvent, event sharedEvent) {
	select {
	case out <- event:
	case <-ctx.Done():
	}
}

func waitSharedRetry(ctx context.Context) bool {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}
