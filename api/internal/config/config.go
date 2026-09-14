// Package config holds the operator settings, in a JSON file rather than in the
// database: it has to stay readable and editable when the server will not start,
// and none of it justifies a reactive collection.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config is the whole operator-facing configuration. Anything a deployment
// needs to set lives here, including the one application setting an
// unauthenticated screen has to read.
type Config struct {
	// PublicURL is the address of this server as reachable from outside the
	// browser: speakers fetching a stream, share links, future integrations.
	// ListenAddr is the address the server binds to. Loopback keeps it to this
	// machine; 0.0.0.0 lets the network in, which anything fetching from the
	// server, a speaker, a phone, needs.
	ListenAddr    string `json:"listenAddr"`
	PublicURL     string `json:"publicUrl"`
	CacheDir      string `json:"cacheDir"`
	CacheMaxFiles int    `json:"cacheMaxFiles"`
	CacheMaxSize  int64  `json:"cacheMaxSize"`
	// Absent means closed: the zero value is the safe one, so a hand-written or
	// truncated file never opens registration by accident.
	RegistrationAllowed bool `json:"registrationAllowed"`
}

// Store reads and writes the configuration file, and hands out copies so no
// caller can mutate the shared value.
type Store struct {
	path string

	mu      sync.RWMutex
	current Config
}

// DefaultPath is where the file lives unless CONFIG_FILE says otherwise. The
// container mounts /config; a checkout gets a local directory.
func DefaultPath() string {
	if path := os.Getenv("CONFIG_FILE"); path != "" {
		return path
	}
	return filepath.Join("config", "config.json")
}

// Load opens the configuration file, creating it with the defaults when it is
// missing. The file is the only source of truth: nothing is read from the
// environment except where the file itself lives.
func Load(path string) (*Store, bool, error) {
	store := &Store{path: path}

	data, err := os.ReadFile(path)
	if err == nil {
		cfg := defaults()
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, false, err
		}

		store.current = heal(cfg)
		return store, false, nil
	}
	if !os.IsNotExist(err) {
		return nil, false, err
	}

	store.current = defaults()
	return store, true, store.write(store.current)
}

// Fallback is the store used when the file cannot be read: the server still
// starts, on defaults, and says so. It keeps the path it failed to read, so an
// administrator correcting the configuration from the admin screen writes to
// the file the server will read next time rather than nowhere.
func Fallback(path string) *Store {
	return &Store{path: path, current: defaults()}
}

// Reload re-reads the file. Migrations run after the store is first loaded and
// may write to it, so the serving process has to pick their changes up.
func (s *Store) Reload() error {
	if s.path == "" {
		return nil
	}

	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}

	cfg := defaults()
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.current = heal(cfg)
	return nil
}

// Get returns a copy of the current configuration.
func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// Path is where the configuration is read from and written to.
func (s *Store) Path() string { return s.path }

// Save replaces the configuration and persists it.
func (s *Store) Save(next Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.write(next); err != nil {
		return err
	}

	s.current = next
	return nil
}

// write lands the file in one step: a half-written configuration is worse than
// an old one, and this file is what a stuck server is recovered with.
func (s *Store) write(cfg Config) error {
	if s.path == "" {
		return nil
	}

	if dir := filepath.Dir(s.path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".config-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	return os.Rename(tmp.Name(), s.path)
}

// heal replaces values a file can hold but nothing can use. An empty string is
// what a hand-edited or half-written file leaves behind, and taking it at face
// value silently changes where the server listens or what address it hands out.
func heal(cfg Config) Config {
	fallback := defaults()
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = fallback.ListenAddr
	}
	if cfg.PublicURL == "" {
		cfg.PublicURL = fallback.PublicURL
	}
	if cfg.CacheDir == "" {
		cfg.CacheDir = fallback.CacheDir
	}
	if cfg.CacheMaxFiles <= 0 {
		cfg.CacheMaxFiles = fallback.CacheMaxFiles
	}
	if cfg.CacheMaxSize <= 0 {
		cfg.CacheMaxSize = fallback.CacheMaxSize
	}
	return cfg
}

func defaults() Config {
	return Config{
		PublicURL:           "http://localhost:8090",
		CacheDir:            "/tmp/melody-manager-cache",
		CacheMaxFiles:       500,
		CacheMaxSize:        5 * 1024 * 1024 * 1024,
		RegistrationAllowed: false,
	}
}
