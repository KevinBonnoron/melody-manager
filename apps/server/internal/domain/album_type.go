package domain

import "time"

// Kinds of release an album can be.
const (
	AlbumSingle = "single"
	AlbumEP     = "ep"
	AlbumFull   = "album"
	AlbumMix    = "mix"
)

// shortRelease is the running time a single or an EP stays under: past it a release is an album
// whatever its track count.
const shortRelease = 30 * time.Minute

// ClassifyAlbum names the kind of release from how many tracks it holds and how long they run:
// up to three short tracks is a single, up to six an EP, a lone track of half an hour or more a
// mix (one recording that no one cut into tracks), anything else an album.
func ClassifyAlbum(tracks int, seconds int) string {
	if tracks <= 0 {
		return ""
	}
	short := time.Duration(seconds)*time.Second < shortRelease
	switch {
	case tracks == 1 && !short:
		return AlbumMix
	case tracks <= 3 && short:
		return AlbumSingle
	case tracks <= 6 && short:
		return AlbumEP
	default:
		return AlbumFull
	}
}
