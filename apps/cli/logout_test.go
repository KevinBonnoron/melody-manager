package main

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestLogoutRevokesTheSavedSessionBeforeRemovingIt(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	var called bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.Method != http.MethodDelete || r.URL.Path != "/api/sessions/current" || r.Header.Get("Authorization") != "Bearer saved-token" {
			t.Errorf("unexpected logout request: %s %s, auth %q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	if err := saveSession(&Session{Server: server.URL, Token: "saved-token"}); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	if err := logout(&out); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("logout did not revoke the server session")
	}
	path, err := configPath()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("saved session still exists: %v", err)
	}
	if out.String() != "Signed out.\n" {
		t.Fatalf("logout output = %q", out.String())
	}
}

func TestLogoutKeepsSessionWhenRevocationFails(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	if err := saveSession(&Session{Server: server.URL, Token: "saved-token"}); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	if err := logout(&out); err == nil {
		t.Fatal("logout succeeded despite failed revocation")
	}
	path, err := configPath()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("saved session was removed: %v", err)
	}
	if out.Len() != 0 {
		t.Fatalf("logout reported success: %q", out.String())
	}
}
