package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestSharedStateCycle(t *testing.T) {
	if cycle := (sharedState{}).Cycle(); cycle != 0 {
		t.Fatalf("zero state cycle = %d", cycle)
	}
	positionAt := sharedTime{Time: time.UnixMilli(1234)}
	if cycle := (sharedState{PositionAt: positionAt}).Cycle(); cycle != 1234 {
		t.Fatalf("position fallback cycle = %d", cycle)
	}
	began := sharedTime{Time: time.UnixMilli(5678)}
	if cycle := (sharedState{Began: began, PositionAt: positionAt}).Cycle(); cycle != 5678 {
		t.Fatalf("began cycle = %d", cycle)
	}
}

func TestSharedStateAcceptsEmptyTimestamps(t *testing.T) {
	var state sharedState
	if err := json.Unmarshal([]byte(`{"positionAt":"","beganAt":"","now":""}`), &state); err != nil {
		t.Fatalf("empty timestamps rejected: %v", err)
	}
	if !state.PositionAt.IsZero() || !state.Began.IsZero() || !state.Now.IsZero() {
		t.Fatalf("empty timestamps did not stay zero: %+v", state)
	}
	if err := json.Unmarshal([]byte(`{"positionAt":"2026-11-02 13:07:19.411Z"}`), &state); err != nil {
		t.Fatalf("PocketBase realtime timestamp rejected: %v", err)
	}
	want := time.Date(2026, 11, 2, 13, 7, 19, 411000000, time.UTC).UnixMilli()
	if got := state.PositionAt.UnixMilli(); got != want {
		t.Fatalf("PocketBase realtime timestamp = %d", got)
	}
}

func TestReadSharedEvents(t *testing.T) {
	input := ": comment\r\n" +
		"event: first\r\n" +
		"data: one\r\n" +
		"data:  two\r\n" +
		"\r\n" +
		"data: fallback\n\n" +
		"id: ignored\n" +
		"event: last\n" +
		"data: eof"
	var events []struct {
		name string
		data string
	}
	if err := readSharedEvents(strings.NewReader(input), func(name, data string) {
		events = append(events, struct {
			name string
			data string
		}{name: name, data: data})
	}); err != nil {
		t.Fatal(err)
	}
	want := []struct {
		name string
		data string
	}{{"first", "one\n two"}, {"message", "fallback"}, {"last", "eof"}}
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("events = %#v, want %#v", events, want)
	}
}

func TestWatchDevicePresence(t *testing.T) {
	type registration struct {
		Type    string `json:"type"`
		Session string `json:"session"`
		Name    string `json:"name"`
		Volume  int    `json:"volume"`
	}
	registrations := make(chan registration, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("Authorization = %q", got)
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/events":
			var body registration
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode registration: %v", err)
			}
			registrations <- body
			w.Header().Set("Content-Type", "text/event-stream")
			flusher := w.(http.Flusher)
			_, _ = io.WriteString(w, ": connected\r\n"+
				"event: registered\r\n"+
				"data: {\"id\":\r\n"+
				"data: \"device-1\"}\r\n\r\n")
			flusher.Flush()

			// The regular client deadline must not apply to this response body.
			time.Sleep(150 * time.Millisecond)
			_, _ = io.WriteString(w, "event: ping\r\ndata: {}\r\n\r\n"+
				"event: devices\r\ndata: []\r\n\r\n"+
				"event: task\r\ndata: {}\r\n\r\n"+
				"event: command\r\n"+
				"data: {\"deviceId\":\"device-1\",\r\n"+
				"data: \"action\":\"next\"}\r\n\r\n")
			flusher.Flush()
			<-r.Context().Done()
		case r.Method == http.MethodGet && r.URL.Path == "/api/player":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"track":"track-1","position":12.5,"positionAt":"2026-11-02T10:00:00Z","beganAt":"2026-11-02T09:59:00Z","playing":true,"devices":["device-1"],"list":["track-1"],"order":[0],"index":0,"shuffle":false,"repeat":"all","now":"2026-11-02T10:00:01Z"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	c := newClient(&Session{Server: server.URL, Token: "secret"})
	c.http.Timeout = 100 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	out := make(chan sharedEvent, 8)
	done := make(chan struct{})
	go func() {
		defer close(done)
		watchDevicePresence(ctx, c, "session-1", "Living room", out)
	}()
	defer stopSharedWatcher(t, cancel, done)

	registered := receiveSharedEvent(t, out)
	if registered.kind != sharedRegistered || registered.deviceID != "device-1" {
		t.Fatalf("registered event = %#v", registered)
	}
	initial := receiveSharedEvent(t, out)
	if initial.kind != sharedStateChanged || initial.err != nil {
		t.Fatalf("initial state event = %#v", initial)
	}
	if initial.state.Track != "track-1" || initial.state.Position != 12.5 || !initial.state.Playing || initial.state.Repeat != "all" {
		t.Fatalf("initial state = %#v", initial.state)
	}
	command := receiveSharedEvent(t, out)
	if command.kind != sharedCommand || command.deviceID != "device-1" || command.action != "next" {
		t.Fatalf("command event = %#v", command)
	}

	select {
	case body := <-registrations:
		want := registration{Type: "cli", Session: "session-1", Name: "Living room", Volume: 100}
		if body != want {
			t.Fatalf("registration = %#v, want %#v", body, want)
		}
	default:
		t.Fatal("registration request was not received")
	}
}

func TestWatchDevicePresenceFallsBackForServerWithoutCLI(t *testing.T) {
	registrations := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/events":
			var body struct {
				Type string `json:"type"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			registrations <- body.Type
			if body.Type == "cli" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"message":"Unregisterable device type."}`)
				return
			}
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "event: registered\ndata: {\"id\":\"device-1\"}\n\n")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
		case "/api/player":
			_, _ = io.WriteString(w, `{}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	out := make(chan sharedEvent, 8)
	done := make(chan struct{})
	go func() {
		defer close(done)
		watchDevicePresence(ctx, newClient(&Session{Server: server.URL}), "session", "Terminal", out)
	}()
	defer stopSharedWatcher(t, cancel, done)

	if event := receiveSharedEvent(t, out); event.kind != sharedRegistered || event.deviceID != "device-1" {
		t.Fatalf("registration after fallback = %#v", event)
	}
	if first, second := <-registrations, <-registrations; first != "cli" || second != "desktop" {
		t.Fatalf("registrations = %q then %q, want cli then desktop", first, second)
	}
}

func TestWatchSharedState(t *testing.T) {
	type subscription struct {
		ClientID      string   `json:"clientId"`
		Subscriptions []string `json:"subscriptions"`
	}
	subscriptions := make(chan subscription, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("Authorization = %q", got)
		}
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/realtime":
			w.Header().Set("Content-Type", "text/event-stream")
			flusher := w.(http.Flusher)
			_, _ = io.WriteString(w, "event: PB_CONNECT\r\n"+
				"data: {\"clientId\":\"realtime-1\"}\r\n\r\n"+
				"event: playback_state/state-1\r\n"+
				"data: {\"action\":\"update\",\"record\":\r\n"+
				"data: {\"track\":\"updated\",\"position\":42.25,\"playing\":true,\"index\":2}}\r\n\r\n"+
				"event: playback_state/state-1\r\n"+
				"data: {\"action\":\"delete\",\"record\":null}\r\n\r\n")
			flusher.Flush()
			<-r.Context().Done()
		case r.Method == http.MethodPost && r.URL.Path == "/api/realtime":
			var body subscription
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode subscription: %v", err)
			}
			subscriptions <- body
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/api/player":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"track":"initial","index":1}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	c := newClient(&Session{Server: server.URL, Token: "secret"})
	ctx, cancel := context.WithCancel(context.Background())
	out := make(chan sharedEvent, 8)
	done := make(chan struct{})
	go func() {
		defer close(done)
		watchSharedState(ctx, c, out)
	}()
	defer stopSharedWatcher(t, cancel, done)

	initial := receiveSharedEvent(t, out)
	if initial.kind != sharedStateChanged || initial.state.Track != "initial" || initial.state.Index != 1 {
		t.Fatalf("initial state event = %#v", initial)
	}
	updated := receiveSharedEvent(t, out)
	if updated.kind != sharedStateChanged || updated.state.Track != "updated" || updated.state.Position != 42.25 || !updated.state.Playing || updated.state.Index != 2 {
		t.Fatalf("updated state event = %#v", updated)
	}
	deleted := receiveSharedEvent(t, out)
	if deleted.kind != sharedStateChanged || !reflect.DeepEqual(deleted.state, sharedState{}) {
		t.Fatalf("deleted state event = %#v", deleted)
	}

	select {
	case body := <-subscriptions:
		want := subscription{ClientID: "realtime-1", Subscriptions: []string{"playback_state/*"}}
		if !reflect.DeepEqual(body, want) {
			t.Fatalf("subscription = %#v, want %#v", body, want)
		}
	default:
		t.Fatal("realtime subscription was not received")
	}
}

func TestSharedOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("Authorization = %q", got)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		switch r.URL.Path {
		case "/api/player/next":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode order: %v", err)
			}
			if !reflect.DeepEqual(body, map[string]any{"position": float64(14)}) {
				t.Errorf("order body = %#v", body)
			}
			_, _ = io.WriteString(w, `{"track":"next-track","index":3}`)
		case "/api/player/invalid":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"message":"invalid order"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	c := newClient(&Session{Server: server.URL, Token: "secret"})

	event := sharedOrder(c, "next", map[string]any{"position": 14})
	if event.kind != sharedStateChanged || event.err != nil || event.state.Track != "next-track" || event.state.Index != 3 {
		t.Fatalf("order event = %#v", event)
	}
	failed := sharedOrder(c, "invalid", nil)
	if failed.kind != sharedFailed || failed.err == nil || failed.err.Error() != "invalid order" {
		t.Fatalf("failed order event = %#v", failed)
	}
}

func receiveSharedEvent(t *testing.T, out <-chan sharedEvent) sharedEvent {
	t.Helper()
	select {
	case event := <-out:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for shared event")
		return sharedEvent{}
	}
}

func stopSharedWatcher(t *testing.T, cancel context.CancelFunc, done <-chan struct{}) {
	t.Helper()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("shared watcher did not stop after cancellation")
	}
}
