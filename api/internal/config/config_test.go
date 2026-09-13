package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// A missing file is written with the defaults, so a fresh install has something
// to read and an operator something to edit.
func TestLoadCreatesTheFileWithDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	store, created, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !created {
		t.Error("expected the file to be created")
	}
	if got := store.Get(); !reflect.DeepEqual(got, defaults()) {
		t.Errorf("loaded = %+v, want the defaults", got)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("file not written: %v", err)
	}
}

// The file is the only source of truth, and a partial one keeps the defaults
// for whatever it leaves out rather than zeroing those fields.
func TestLoadReadsTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"publicUrl":"http://saved:9000"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	store, created, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if created {
		t.Error("existing file should not be recreated")
	}
	if got := store.Get().PublicURL; got != "http://saved:9000" {
		t.Errorf("PublicURL = %q, want the saved value", got)
	}
	if got := store.Get().CacheMaxFiles; got != defaults().CacheMaxFiles {
		t.Errorf("CacheMaxFiles = %d, want the default", got)
	}
}

func TestSaveRoundTrips(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.json")
	store, _, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	next := store.Get()
	next.PublicURL = "http://elsewhere:8080"
	next.RegistrationAllowed = true
	if err := store.Save(next); err != nil {
		t.Fatalf("Save: %v", err)
	}

	reopened, _, err := Load(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if got := reopened.Get(); got.PublicURL != "http://elsewhere:8080" || !got.RegistrationAllowed {
		t.Errorf("reloaded = %+v", got)
	}
}

// A speaker that answers discovery once has to survive the many passes where it
// stays silent, so the list only ever grows and never rewrites what it holds.
func TestRememberSpeakersAccumulates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store, _, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if err := store.RememberSpeakers([]string{"192.168.1.20"}); err != nil {
		t.Fatalf("RememberSpeakers: %v", err)
	}
	if err := store.RememberSpeakers([]string{"192.168.1.21", "192.168.1.20"}); err != nil {
		t.Fatalf("RememberSpeakers: %v", err)
	}

	want := []string{"192.168.1.20", "192.168.1.21"}
	if got := store.KnownSpeakers(); !reflect.DeepEqual(got, want) {
		t.Errorf("KnownSpeakers() = %v, want %v", got, want)
	}

	reopened, _, err := Load(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if got := reopened.KnownSpeakers(); !reflect.DeepEqual(got, want) {
		t.Errorf("after reload = %v, want %v", got, want)
	}
}

// A file can hold values nothing can use: an empty listen address is what a
// hand-edited or half-written file leaves behind, and taking it literally moves
// the server somewhere nobody asked for.
func TestLoadHealsEmptyValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"listenAddr":"","publicUrl":"","cacheMaxFiles":0}`), 0o600); err != nil {
		t.Fatal(err)
	}

	store, _, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	got := store.Get()
	if got.ListenAddr != defaults().ListenAddr {
		t.Errorf("ListenAddr = %q, want the default", got.ListenAddr)
	}
	if got.PublicURL != defaults().PublicURL {
		t.Errorf("PublicURL = %q, want the default", got.PublicURL)
	}
	if got.CacheMaxFiles != defaults().CacheMaxFiles {
		t.Errorf("CacheMaxFiles = %d, want the default", got.CacheMaxFiles)
	}
}
