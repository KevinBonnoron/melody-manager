package providers

import (
	"context"
	"strings"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

// Bandcamp resolves albums/tracks via yt-dlp. No search API.
type Bandcamp struct{}

func (Bandcamp) ID() string { return "bandcamp" }

func (Bandcamp) ResolveTracks(ctx context.Context, url string, _ Config) ([]domain.ResolvedTrack, error) {
	// Album/artist pages expose multiple entries; single tracks one.
	if entries, err := ytdlp.ExtractPlaylistTracks(ctx, url, ""); err == nil && len(entries) > 1 {
		out := make([]domain.ResolvedTrack, 0, len(entries))
		for _, e := range entries {
			out = append(out, ytdlp.BuildResolvedTrack(e, "bandcamp"))
		}
		return out, nil
	}
	info, err := ytdlp.ExtractTrackInfo(ctx, url, "")
	if err != nil {
		return nil, err
	}
	return []domain.ResolvedTrack{ytdlp.BuildResolvedTrack(*info, "bandcamp")}, nil
}

func (Bandcamp) ResolveStream(ctx context.Context, sourceURL string, _ Config) (*Stream, error) {
	url, err := ytdlp.StreamURL(ctx, strings.TrimPrefix(sourceURL, "bandcamp:"), "")
	if err != nil {
		return nil, err
	}
	return &Stream{Kind: "url", URL: url}, nil
}

var (
	_ TrackResolver  = Bandcamp{}
	_ StreamResolver = Bandcamp{}
)
