package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type client struct {
	server string
	token  string
	userID string
	http   *http.Client
}

func newClient(session *Session) *client {
	return &client{
		server: strings.TrimRight(session.Server, "/"),
		token:  session.Token,
		userID: tokenUserID(session.Token),
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

type apiError struct {
	Status  int
	Message string `json:"message"`
}

func (e *apiError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("the server answered %d", e.Status)
	}
	return e.Message
}

func (c *client) get(path string, out any) error {
	return c.send(http.MethodGet, path, nil, out)
}

func (c *client) send(method, path string, body any, out any) error {
	return c.sendContext(context.Background(), method, path, body, out)
}

func (c *client) sendContext(ctx context.Context, method, path string, body any, out any) error {
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
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	data, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		failure := &apiError{Status: res.StatusCode}
		_ = json.Unmarshal(data, failure)
		return failure
	}
	if out == nil {
		return nil
	}

	return json.Unmarshal(data, out)
}

// bytesAt fetches a whole response, for the small things: a cover, a token.
func (c *client) bytesAt(path string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, c.server+path, nil)
	if err != nil {
		return nil, err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return nil, &apiError{Status: res.StatusCode}
	}
	return io.ReadAll(res.Body)
}

type record struct {
	ID string `json:"id"`
}

type album struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Year    int      `json:"year"`
	Artists []string `json:"artists"`
	Cover   string   `json:"cover"`
}

type artist struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type track struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Duration     float64  `json:"duration"`
	Album        string   `json:"album"`
	Artists      []string `json:"artists"`
	Source       string   `json:"source"`
	Availability string   `json:"availability"`
	Metadata     struct {
		TrackNumber *int     `json:"trackNumber"`
		DiscNumber  *int     `json:"discNumber"`
		StartTime   *float64 `json:"startTime"`
	} `json:"metadata"`
}

type page[T any] struct {
	Items      []T `json:"items"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
	Page       int `json:"page"`
	PerPage    int `json:"perPage"`
}

func listRecords[T any](c *client, collection string, query url.Values) ([]T, error) {
	params := url.Values{}
	for key, values := range query {
		params[key] = append([]string(nil), values...)
	}
	if params.Get("perPage") == "" {
		params.Set("perPage", "200")
	}

	var items []T
	for {
		var result page[T]
		if err := c.get("/api/collections/"+collection+"/records?"+params.Encode(), &result); err != nil {
			return nil, err
		}
		items = append(items, result.Items...)
		if len(result.Items) == 0 || result.Page >= result.TotalPages || result.TotalPages == 0 {
			return items, nil
		}
		params.Set("page", fmt.Sprint(result.Page+1))
	}
}

// filterQuote escapes a value for the PocketBase filter DSL, where a quote in a
// name would otherwise end the string and the rest would be read as syntax.
func filterQuote(value string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(value) + `"`
}
