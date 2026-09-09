// Package covers resolves album artwork from external services, used as a
// fallback when an audio file carries no embedded picture.
package covers

import "context"

// Source is one lookup service. The order of sources is the resolution order;
// the first non-empty answer wins.
type Source interface {
	Name() string
	AlbumCover(ctx context.Context, album, artist string) (string, error)
}

var sources = []Source{musicBrainz{}}

// AlbumCover returns a URL to the album's front cover, or "" when no source
// knows the release.
func AlbumCover(ctx context.Context, album, artist string) string {
	if album == "" || artist == "" {
		return ""
	}
	for _, s := range sources {
		if u, err := s.AlbumCover(ctx, album, artist); err == nil && u != "" {
			return u
		}
	}
	return ""
}
