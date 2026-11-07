package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestListRecordsPaginates(t *testing.T) {
	var pages []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/collections/tracks/records" || r.URL.Query().Get("filter") != "liked = true" || r.URL.Query().Get("perPage") != "200" {
			t.Errorf("unexpected request: %s", r.URL.String())
		}
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Error("missing authorization")
		}
		p := r.URL.Query().Get("page")
		pages = append(pages, p)
		if p == "" {
			p = "1"
		}
		var n int
		fmt.Sscan(p, &n)
		count := 200
		if n == 2 {
			count = 3
		}
		items := make([]record, count)
		for i := range items {
			items[i].ID = fmt.Sprint((n-1)*200 + i)
		}
		json.NewEncoder(w).Encode(page[record]{Items: items, Page: n, PerPage: 200, TotalPages: 2, TotalItems: 203})
	}))
	defer server.Close()
	c := newClient(&Session{Server: server.URL, Token: "secret"})
	query := url.Values{"filter": {"liked = true"}}
	items, err := listRecords[record](c, "tracks", query)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 203 || items[202].ID != "202" || strings.Join(pages, ",") != ",2" {
		t.Fatalf("got %d items and pages %v", len(items), pages)
	}
	if query.Get("page") != "" || query.Get("perPage") != "" {
		t.Fatalf("query was mutated: %v", query)
	}
}

func TestStreamKeepsAuthorizationAndHasNoClientDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" || r.URL.Path != "/api/tracks/abc/stream" {
			t.Errorf("unexpected stream request: %s %q", r.URL.Path, r.Header.Get("Authorization"))
		}
		w.Write([]byte("first"))
		w.(http.Flusher).Flush()
		time.Sleep(100 * time.Millisecond)
		w.Write([]byte("second"))
	}))
	defer server.Close()
	c := newClient(&Session{Server: server.URL, Token: "secret"})
	c.http.Timeout = 20 * time.Millisecond
	body, err := c.stream(context.Background(), "abc")
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()
	data, err := io.ReadAll(body)
	if err != nil || string(data) != "firstsecond" {
		t.Fatalf("stream = %q, %v", data, err)
	}
	if c.http.Timeout != 20*time.Millisecond {
		t.Fatal("stream changed the API client's timeout")
	}
}

func TestStreamReportsServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"message":"track unavailable"}`))
	}))
	defer server.Close()
	c := newClient(&Session{Server: server.URL})
	_, err := c.stream(context.Background(), "abc")
	var apiErr *apiError
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusForbidden || err.Error() != "track unavailable" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPlayTrackCancellationStopsStreamAndPlayer(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test player uses a shell script")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "mpv"), []byte("#!/bin/sh\nexec cat >/dev/null\n"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("audio"))
		w.(http.Flusher).Flush()
		close(started)
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer server.Close()
	defer close(release)
	c := newClient(&Session{Server: server.URL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- playTrackControlled(ctx, c, "abc", 0, false, nil, nil) }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("stream did not start")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("playTrack returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("playback did not stop after cancellation")
	}
}
