package domain

import "testing"

func TestClassifyAlbum(t *testing.T) {
	const min = 60
	cases := []struct {
		name    string
		tracks  int
		seconds int
		want    string
	}{
		{"one short track", 1, 4 * min, AlbumSingle},
		{"three short tracks", 3, 10 * min, AlbumSingle},
		{"four short tracks", 4, 15 * min, AlbumEP},
		{"six short tracks", 6, 29 * min, AlbumEP},
		{"seven tracks", 7, 25 * min, AlbumFull},
		{"few tracks running past half an hour", 3, 45 * min, AlbumFull},
		{"one track of exactly half an hour is a mix", 1, 30 * min, AlbumMix},
		{"one track just under half an hour", 1, 30*min - 1, AlbumSingle},
		{"nothing at all", 0, 0, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ClassifyAlbum(tc.tracks, tc.seconds); got != tc.want {
				t.Fatalf("ClassifyAlbum(%d, %d) = %q, want %q", tc.tracks, tc.seconds, got, tc.want)
			}
		})
	}
}
