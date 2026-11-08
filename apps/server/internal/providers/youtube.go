package providers

import (
	"context"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

// YouTube uses yt-dlp for search, resolution and streaming.
type YouTube struct{}

func (YouTube) ID() string { return "youtube" }

func (YouTube) Search(ctx context.Context, query string, typ domain.SearchResultType, cfg Config) ([]domain.SearchResult, error) {
	if typ != domain.ResultTrack {
		return nil, nil
	}
	cookiesFile, cleanup := writeCookies(cfg)
	defer cleanup()
	entries, err := ytdlp.SearchEntries(ctx, "ytsearch20:"+query, cookiesFile)
	if err != nil {
		return nil, err
	}
	return mapSearchResults(entries, "youtube"), nil
}

func (YouTube) ResolveTracks(ctx context.Context, url string, cfg Config) ([]domain.ResolvedTrack, error) {
	cookiesFile, cleanup := writeCookies(cfg)
	defer cleanup()

	info, err := ytdlp.ExtractTrackInfo(ctx, url, cookiesFile)
	if err != nil {
		return nil, err
	}
	base := ytdlp.BuildResolvedTrack(*info, "youtube")
	base.ArtistImageURL = ytdlp.ChannelAvatar(ctx, firstNonEmpty(info.ChannelURL, info.UploaderURL), cookiesFile)
	if len(info.Chapters) > 1 {
		if info.Album == "" && info.Title != "" {
			base.AlbumName = info.Title
		}
		tracks := make([]domain.ResolvedTrack, 0, len(info.Chapters))
		for _, ch := range info.Chapters {
			t := base
			st, et := ch.StartTime, ch.EndTime
			t.Title = ch.Title
			t.Duration = int(et - st)
			t.Metadata.StartTime = &st
			t.Metadata.EndTime = &et
			tracks = append(tracks, t)
		}
		return tracks, nil
	}
	return []domain.ResolvedTrack{base}, nil
}

func (YouTube) ResolveStream(ctx context.Context, sourceURL string, cfg Config) (*Stream, error) {
	cookiesFile, cleanup := writeCookies(cfg)
	defer cleanup()
	url, err := ytdlp.StreamURL(ctx, sourceURL, cookiesFile)
	if err != nil {
		return nil, err
	}
	return &Stream{Kind: "url", URL: url}, nil
}

// ForgetStream drops the address held for this source under these credentials.
func (YouTube) ForgetStream(sourceURL string, cfg Config) {
	cookiesFile, cleanup := writeCookies(cfg)
	defer cleanup()
	ytdlp.InvalidateStreamURL(sourceURL, cookiesFile)
}

var (
	_ Searcher        = YouTube{}
	_ StreamForgetter = YouTube{}
	_ TrackResolver   = YouTube{}
	_ StreamResolver  = YouTube{}
)

func mapSearchResults(entries []ytdlp.TrackInfo, source string) []domain.SearchResult {
	out := make([]domain.SearchResult, 0, len(entries))
	for _, e := range entries {
		out = append(out, domain.SearchResult{
			Type:     domain.ResultTrack,
			Title:    e.Title,
			Subtitle: firstNonEmpty(e.Artist, e.Uploader, e.Channel),
			Source:   source,
			Origin:   e.WebpageURL,
			CoverURL: e.Thumbnail,
			Duration: int(e.Duration),
		})
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func (YouTube) PlaylistName(ctx context.Context, url string, cfg Config) (string, error) {
	cookiesFile, cleanup := writeCookies(cfg)
	defer cleanup()
	info, err := ytdlp.ExtractPlaylistInfo(ctx, url, cookiesFile)
	if err != nil {
		return "", err
	}
	return info.Title, nil
}
