package providers

import (
	"context"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

// SoundCloud uses yt-dlp (scsearch). Stream URLs expire quickly, so streaming
// goes through Download (cached) rather than a long-lived proxy URL.
type SoundCloud struct{}

func (SoundCloud) ID() string { return "soundcloud" }

func (SoundCloud) Search(ctx context.Context, query string, _ domain.SearchResultType, _ Config) ([]domain.SearchResult, error) {
	entries, err := ytdlp.ExtractPlaylistTracks(ctx, "scsearch20:"+query, "")
	if err != nil {
		return nil, err
	}
	return mapSearchResults(entries, "soundcloud"), nil
}

func (SoundCloud) ResolveTracks(ctx context.Context, url string, _ Config) ([]domain.ResolvedTrack, error) {
	info, err := ytdlp.ExtractTrackInfo(ctx, url, "")
	if err != nil {
		return nil, err
	}
	return []domain.ResolvedTrack{ytdlp.BuildResolvedTrack(*info, "soundcloud")}, nil
}

func (SoundCloud) ResolveStream(ctx context.Context, sourceURL string, _ Config) (*Stream, error) {
	url, _ := ytdlp.StreamURL(ctx, sourceURL, "")
	return &Stream{
		Kind: "url",
		URL:  url,
		Download: func(ctx context.Context) (string, error) {
			return ytdlp.DownloadAudio(ctx, sourceURL)
		},
	}, nil
}

var (
	_ Searcher       = SoundCloud{}
	_ TrackResolver  = SoundCloud{}
	_ StreamResolver = SoundCloud{}
)
