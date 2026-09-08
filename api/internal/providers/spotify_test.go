package providers

import (
	"encoding/json"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// The Web API returns a differently shaped section per search type, and only
// one of them is populated per response.
func TestMapSpotifyResults(t *testing.T) {
	const payload = `{
	  "tracks":    {"items": [{"name": "Track A", "artists": [{"name": "Artist A"}], "duration_ms": 185000,
	                           "external_urls": {"spotify": "https://open.spotify.com/track/1"},
	                           "album": {"images": [{"url": "https://img/track.jpg"}]}}]},
	  "albums":    {"items": [{"name": "Album A", "artists": [{"name": "Artist A"}],
	                           "images": [{"url": "https://img/album.jpg"}],
	                           "external_urls": {"spotify": "https://open.spotify.com/album/1"}}]},
	  "artists":   {"items": [{"name": "Artist A", "images": [{"url": "https://img/artist.jpg"}],
	                           "external_urls": {"spotify": "https://open.spotify.com/artist/1"}}]},
	  "playlists": {"items": [null,
	                          {"name": "Playlist A", "owner": {"display_name": "Someone"},
	                           "images": [{"url": "https://img/playlist.jpg"}],
	                           "external_urls": {"spotify": "https://open.spotify.com/playlist/1"}}]}
	}`

	var out spotifySearchResponse
	if err := json.Unmarshal([]byte(payload), &out); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		typ      domain.SearchResultType
		title    string
		subtitle string
		source   string
		cover    string
		duration int
	}{
		{domain.ResultTrack, "Track A", "Artist A", "https://open.spotify.com/track/1", "https://img/track.jpg", 185},
		{domain.ResultAlbum, "Album A", "Artist A", "https://open.spotify.com/album/1", "https://img/album.jpg", 0},
		{domain.ResultArtist, "Artist A", "", "https://open.spotify.com/artist/1", "https://img/artist.jpg", 0},
		{domain.ResultPlaylist, "Playlist A", "Someone", "https://open.spotify.com/playlist/1", "https://img/playlist.jpg", 0},
	}

	for _, tc := range cases {
		t.Run(string(tc.typ), func(t *testing.T) {
			got := mapSpotifyResults(tc.typ, out)
			// The null playlist entry must not become a result.
			if len(got) != 1 {
				t.Fatalf("got %d results, want 1: %+v", len(got), got)
			}
			r := got[0]
			if r.Type != tc.typ {
				t.Errorf("type = %q, want %q", r.Type, tc.typ)
			}
			if r.Title != tc.title {
				t.Errorf("title = %q, want %q", r.Title, tc.title)
			}
			if r.Subtitle != tc.subtitle {
				t.Errorf("subtitle = %q, want %q", r.Subtitle, tc.subtitle)
			}
			if r.SourceURL != tc.source {
				t.Errorf("sourceUrl = %q, want %q", r.SourceURL, tc.source)
			}
			if r.CoverURL != tc.cover {
				t.Errorf("coverUrl = %q, want %q", r.CoverURL, tc.cover)
			}
			if r.Duration != tc.duration {
				t.Errorf("duration = %d, want %d", r.Duration, tc.duration)
			}
			if r.Source != "spotify" {
				t.Errorf("source = %q, want \"spotify\"", r.Source)
			}
		})
	}

	if got := mapSpotifyResults("nonsense", out); got != nil {
		t.Errorf("unknown type returned %d results, want none", len(got))
	}
}
