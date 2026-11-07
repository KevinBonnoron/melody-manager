package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestLibraryAlbumOrderAndUnassignedTracks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var items any
		switch r.URL.Path {
		case "/api/collections/albums/records":
			items = []album{{ID: "a", Name: "Album", Artists: []string{"artist"}}}
		case "/api/collections/artists/records":
			items = []artist{{ID: "artist", Name: "Artist"}}
		case "/api/collections/tracks/records":
			items = []map[string]any{
				{"id": "second", "title": "A second", "album": "a", "metadata": map[string]int{"trackNumber": 2}},
				{"id": "first", "title": "Z first", "album": "a", "metadata": map[string]int{"trackNumber": 1}},
				{"id": "loose", "title": "Loose"},
			}
		default:
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "page": 1, "totalPages": 1})
	}))
	defer server.Close()
	lib, err := loadLibrary(newClient(&Session{Server: server.URL}))
	if err != nil {
		t.Fatal(err)
	}
	if len(lib.Albums) != 1 || lib.Albums[0].Artist != "Artist" || len(lib.Albums[0].Tracks) != 2 || lib.Albums[0].Tracks[0].ID != "first" || lib.Albums[0].Tracks[1].ID != "second" {
		t.Fatalf("album tracks or artist incorrect: %+v", lib.Albums)
	}
	model := &playerModel{library: lib, query: "loose"}
	model.updateFilter()
	if len(model.filtered) != 1 || len(model.selectedTracks()) != 1 || model.selectedTracks()[0].ID != "loose" {
		t.Fatalf("unassigned track is not searchable: %+v", model.selectedTracks())
	}
}

func TestAlbumOrderMatchesChapterAndDiscPositions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var items any
		switch r.URL.Path {
		case "/api/collections/albums/records":
			items = []album{{ID: "chapters", Name: "Video"}, {ID: "discs", Name: "Discs"}}
		case "/api/collections/artists/records":
			items = []artist{}
		case "/api/collections/tracks/records":
			items = []map[string]any{
				{"id": "late", "title": "Alpha", "album": "chapters", "metadata": map[string]any{"startTime": 600}},
				{"id": "early", "title": "Zulu", "album": "chapters", "metadata": map[string]any{"startTime": 0}},
				{"id": "unknown", "title": "A", "album": "chapters"},
				{"id": "disc2", "title": "A", "album": "discs", "metadata": map[string]any{"trackNumber": 1, "discNumber": 2}},
				{"id": "disc1", "title": "Z", "album": "discs", "metadata": map[string]any{"trackNumber": 2, "discNumber": 1}},
			}
		default:
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "page": 1, "totalPages": 1})
	}))
	defer server.Close()
	lib, err := loadLibrary(newClient(&Session{Server: server.URL}))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"chapters": "early,late,unknown", "discs": "disc1,disc2"}
	for _, a := range lib.Albums {
		var ids []string
		for _, track := range a.Tracks {
			ids = append(ids, track.ID)
		}
		if got := strings.Join(ids, ","); got != want[a.Album.ID] {
			t.Errorf("album %s: got %s, want %s", a.Album.ID, got, want[a.Album.ID])
		}
	}
}

func TestSVGAlbumCoverRenders(t *testing.T) {
	cover := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ff0000"/></svg>`)
	lines, err := renderCover(cover, 2, rendererBlocks)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || !strings.Contains(lines[0], "255;0;0") {
		t.Fatalf("cover was not rendered: %q", lines)
	}
}

func TestSearchAcceptsSpaces(t *testing.T) {
	m := &playerModel{library: &Library{Tracks: []libraryTrack{{track: track{ID: "song", Title: "Thank You Summer"}}}}, searching: true}
	for _, key := range []tea.KeyMsg{
		{Type: tea.KeyRunes, Runes: []rune("Thank")},
		{Type: tea.KeySpace},
		{Type: tea.KeyRunes, Runes: []rune("You")},
	} {
		m.Update(key)
	}
	if m.query != "Thank You" || len(m.selectedTracks()) != 1 || m.selectedTracks()[0].ID != "song" {
		t.Fatalf("search %q returned %+v", m.query, m.selectedTracks())
	}
}

func TestSearchArrowsNavigateAndEnterOpensSelection(t *testing.T) {
	lib := &Library{Albums: []LibraryAlbum{
		{Album: album{ID: "a", Name: "Summer One"}},
		{Album: album{ID: "b", Name: "Summer Two"}},
	}}
	m := &playerModel{library: lib, searching: true}
	m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Summer")})
	m.Update(tea.KeyMsg{Type: tea.KeyDown})
	if !m.searching || m.selectedAlbum() == nil || m.selectedAlbum().Album.ID != "b" {
		t.Fatalf("arrow did not navigate search results: index=%d searching=%v", m.albumIndex, m.searching)
	}
	m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if m.searching || !m.detail || m.selectedAlbum().Album.ID != "b" {
		t.Fatalf("enter did not open the selected album: %+v", m)
	}
}
