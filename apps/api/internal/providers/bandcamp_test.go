package providers

import (
	"encoding/json"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

func TestMapBandcampResults(t *testing.T) {
	const payload = `{
	  "results": [
	    {"type": "b", "name": "Artist A", "url": "https://artist.bandcamp.com", "img_id": 42},
	    {"type": "a", "name": "Album A", "band_name": "Artist A", "url": "https://artist.bandcamp.com/album/a", "art_id": 43},
	    {"type": "t", "name": "Track A", "band_name": "Artist A", "url": "https://artist.bandcamp.comhttps://artist.bandcamp.com/track/a", "art_id": 43},
	    {"type": "f", "name": "Fan", "url": "https://bandcamp.com/fan"}
	  ]
	}`
	var out bandcampSearchResponse
	if err := json.Unmarshal([]byte(payload), &out); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		typ      domain.SearchResultType
		title    string
		subtitle string
		origin   string
		cover    string
	}{
		{domain.ResultArtist, "Artist A", "", "https://artist.bandcamp.com", "https://f4.bcbits.com/img/00042_0.png"},
		{domain.ResultAlbum, "Album A", "Artist A", "https://artist.bandcamp.com/album/a", "https://f4.bcbits.com/img/a43_0.png"},
		{domain.ResultTrack, "Track A", "Artist A", "https://artist.bandcamp.com/track/a", "https://f4.bcbits.com/img/a43_0.png"},
	}
	for _, tc := range cases {
		t.Run(string(tc.typ), func(t *testing.T) {
			got := mapBandcampResults(tc.typ, out)
			if len(got) != 1 {
				t.Fatalf("got %d results, want 1: %+v", len(got), got)
			}
			r := got[0]
			if r.Type != tc.typ || r.Title != tc.title || r.Subtitle != tc.subtitle || r.Source != "bandcamp" || r.Origin != tc.origin || r.CoverURL != tc.cover {
				t.Fatalf("unexpected result: %+v", r)
			}
		})
	}

	if got := mapBandcampResults(domain.ResultPlaylist, out); got != nil {
		t.Fatalf("playlists returned %d results, want none", len(got))
	}
}
