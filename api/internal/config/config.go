// Package config holds the operator settings, in a JSON file rather than in the database.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config is the whole operator-facing configuration.
type Config struct {
	ListenAddr          string `json:"listenAddr"`
	PublicURL           string `json:"publicUrl"`
	CacheDir            string `json:"cacheDir"`
	CacheMaxFiles       int    `json:"cacheMaxFiles"`
	CacheMaxSize        int64  `json:"cacheMaxSize"`
	RegistrationAllowed bool   `json:"registrationAllowed"`
}

// Store reads and writes the configuration file, and hands out copies so no caller can mutate
// the shared value.
type Store struct {
	path string

	mu      sync.RWMutex
	current Config
}

// DefaultPath is where the file lives unless CONFIG_FILE says otherwise.
func DefaultPath() string {
	if path := os.Getenv("CONFIG_FILE"); path != "" {
		return path
	}
	return filepath.Join("config", "config.json")
}

// Load opens the configuration file, creating it with the defaults when it is missing.
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

// Fallback is the store used when the file cannot be read: the server still starts, on
// defaults, and says so.
func Fallback(path string) *Store {
	return &Store{path: path, current: defaults()}
}

// Reload re-reads the file.
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
