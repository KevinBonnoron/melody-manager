package services

import (
	"strings"
	"testing"
)

func TestSplitArtistName(t *testing.T) {
	onRecord := func(names ...string) knownArtist {
		return func(name string) bool {
			for _, known := range names {
				if strings.EqualFold(known, name) {
					return true
				}
			}
			return false
		}
	}

	cases := []struct {
		name    string
		raw     string
		known   knownArtist
		anchors []string
		want    string
	}{
		{"a collaboration the folder names", "Couple N & Ulchero", nil, []string{"Couple N", "Couple N"}, "Couple N|Ulchero"},
		{"a collaboration only the library knows", "Couple N & Ulchero", onRecord("Ulchero"), []string{"Some Compilation", "Various"}, "Couple N|Ulchero"},
		{"a band whose name holds an ampersand", "Simon & Garfunkel", nil, []string{"Bookends", "Simon & Garfunkel"}, "Simon & Garfunkel"},
		{"a band whose name holds a slash", "AC/DC", nil, []string{"Back in Black", "AC/DC"}, "AC/DC"},
		{"a semicolon always splits", "Air;Phoenix", nil, []string{"Moon Safari", "Air"}, "Air|Phoenix"},
		{"a featuring always splits", "Daft Punk feat. Pharrell Williams", nil, []string{"Random Access Memories", "Daft Punk"}, "Daft Punk|Pharrell Williams"},
		{"one artist stays one", "Boards of Canada", nil, []string{"Geogaddi", "Boards of Canada"}, "Boards of Canada"},
		{"the same artist twice is named once", "Air & Air", nil, []string{"Moon Safari", "Air"}, "Air"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := strings.Join(splitArtistName(tc.known, tc.raw, tc.anchors...), "|")
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
