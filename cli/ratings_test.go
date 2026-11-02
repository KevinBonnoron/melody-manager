package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestSearchAcceptsLowercaseRatingLetters(t *testing.T) {
	m := &playerModel{
		searching: true, ratings: make(map[string]trackRating),
		library: &Library{Tracks: []libraryTrack{{track: track{ID: "track", Title: "Song"}}}},
	}
	for _, key := range []string{"d", "f"} {
		_, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)})
	}
	if m.query != "df" {
		t.Fatalf("query = %q, want df", m.query)
	}
	if len(m.ratings) != 0 {
		t.Fatalf("lowercase search input changed a rating: %+v", m.ratings)
	}
}

func TestRatingShortcutsToggleSelectedTrack(t *testing.T) {
	rating := trackRating{ID: "rating", Track: "track"}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["user"] != "user" || body["track"] != "track" || body["value"] != "like" {
				t.Errorf("unexpected rating creation: %+v", body)
			}
			rating.Value = body["value"]
			rating.User = body["user"]
			_ = json.NewEncoder(w).Encode(rating)
		case http.MethodPatch:
			if r.URL.Path != "/api/collections/track_ratings/records/rating" {
				t.Errorf("unexpected update path: %s", r.URL.Path)
			}
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			rating.Value = body["value"]
			_ = json.NewEncoder(w).Encode(rating)
		case http.MethodDelete:
			rating = trackRating{}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	token := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"id":"user"}`)) + ".signature"
	tracks := []libraryTrack{{track: track{ID: "track", Title: "Song"}, artist: "Artist"}}
	m := &playerModel{
		client: newClient(&Session{Server: server.URL, Token: token}), width: 80, height: 20,
		library: &Library{Albums: []LibraryAlbum{{Tracks: tracks}}}, filtered: []int{0},
		detail: true, ratings: make(map[string]trackRating),
	}

	press := func(key string) {
		t.Helper()
		_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)})
		if cmd == nil {
			t.Fatalf("rating key %q produced no request", key)
		}
		if _, again := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)}); again != nil {
			t.Fatal("a second request started while the same track was pending")
		}
		m.Update(cmd())
	}

	press("f")
	if m.ratings["track"].Value != "like" || !strings.Contains(m.View(), "♥") {
		t.Fatalf("like is not stored and visible: %+v", m.ratings)
	}
	press("d")
	if m.ratings["track"].Value != "dislike" || !strings.Contains(m.View(), "×") {
		t.Fatalf("dislike did not replace like: %+v", m.ratings)
	}
	press("d")
	if _, exists := m.ratings["track"]; exists {
		t.Fatalf("second dislike should remove the rating: %+v", m.ratings["track"])
	}
}
