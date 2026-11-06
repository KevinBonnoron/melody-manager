package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// Session is what the client needs between two runs: where the server is, and
// the proof that it may talk to it.
type Session struct {
	Server string `json:"server"`
	Token  string `json:"token"`
	Name   string `json:"name,omitempty"`
}

func configPath() (string, error) {
	dir := os.Getenv("XDG_CONFIG_HOME")
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, ".config")
	}

	return filepath.Join(dir, "melody-manager", "session.json"), nil
}

func loadSession() (*Session, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, errNotLoggedIn
	}
	if err != nil {
		return nil, err
	}

	var session Session
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}
	if session.Token == "" || session.Server == "" {
		return nil, errNotLoggedIn
	}

	return &session, nil
}

// saveSession writes the file only the user can read: it holds a bearer token
// that is as good as their password until it expires.
func saveSession(session *Session) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}

	file, err := os.CreateTemp(filepath.Dir(path), ".session-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0o600); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(append(data, '\n')); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

var errNotLoggedIn = errors.New("not signed in: run `melody login`")
