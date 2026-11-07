package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"golang.org/x/term"
)

// login authenticates before replacing any existing session.
func login(in *bufio.Reader, out io.Writer, args []string) error {
	if len(args) > 1 {
		return errors.New("usage: melody login [server URL]")
	}

	var server string
	var err error
	if len(args) == 0 {
		server, err = promptLine(in, out, "Server URL: ")
		if err != nil {
			return err
		}
	} else {
		server = strings.TrimSpace(args[0])
	}

	u, err := url.Parse(server)
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return errors.New("invalid server URL: use an http or https URL without credentials, query, or fragment")
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return errors.New("invalid server URL port")
		}
	}
	server = strings.TrimRight(server, "/")

	email, err := promptLine(in, out, "Email: ")
	if err != nil {
		return err
	}
	if _, err := fmt.Fprint(out, "Password: "); err != nil {
		return err
	}
	var password string
	if term.IsTerminal(int(os.Stdin.Fd())) {
		secret, readErr := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(out)
		if readErr != nil {
			return readErr
		}
		password = string(secret)
	} else {
		password, err = readLine(in)
		if err != nil {
			return err
		}
	}

	var response struct {
		Token  string `json:"token"`
		Record struct {
			Name string `json:"name"`
		} `json:"record"`
	}
	c := newClient(&Session{Server: server})
	if err := c.send(http.MethodPost, "/api/collections/users/auth-with-password", map[string]string{
		"identity": email,
		"password": password,
	}, &response); err != nil {
		return fmt.Errorf("login failed: %w", err)
	}
	if response.Token == "" {
		return errors.New("login failed: server returned an empty token")
	}
	if err := saveSession(&Session{Server: server, Token: response.Token, Name: response.Record.Name}); err != nil {
		return fmt.Errorf("saving session: %w", err)
	}
	fmt.Fprintln(out, "Signed in.")
	return nil
}

func promptLine(in *bufio.Reader, out io.Writer, prompt string) (string, error) {
	if _, err := fmt.Fprint(out, prompt); err != nil {
		return "", err
	}
	value, err := readLine(in)
	return strings.TrimSpace(value), err
}

func readLine(in *bufio.Reader) (string, error) {
	value, err := in.ReadString('\n')
	if err != nil && (err != io.EOF || value == "") {
		return "", err
	}
	return strings.TrimSuffix(strings.TrimSuffix(value, "\n"), "\r"), nil
}

func logout(out io.Writer) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if session, loadErr := loadSession(); loadErr == nil {
		if err := newClient(session).send(http.MethodDelete, "/api/sessions/current", nil, nil); err != nil {
			return fmt.Errorf("server sign-out failed: %w", err)
		}
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_, err = fmt.Fprintln(out, "Signed out.")
	return err
}
