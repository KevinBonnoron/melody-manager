package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

// Bandcamp searches via its public autocomplete API and resolves media via yt-dlp.
type Bandcamp struct{}

var bandcampClient = &http.Client{Timeout: 15 * time.Second}

func (Bandcamp) ID() string { return "bandcamp" }

type bandcampSearchItem struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	BandName string `json:"band_name"`
	ArtID    int64  `json:"art_id"`
	ImgID    int64  `json:"img_id"`
}

type bandcampSearchResponse struct {
	Results []bandcampSearchItem `json:"results"`
}

var bandcampSearchKinds = map[domain.SearchResultType]string{
	domain.ResultTrack:  "t",
	domain.ResultAlbum:  "a",
	domain.ResultArtist: "b",
}

func (Bandcamp) Search(ctx context.Context, query string, typ domain.SearchResultType, _ Config) ([]domain.SearchResult, error) {
	if _, ok := bandcampSearchKinds[typ]; !ok {
		return nil, nil
	}

	// Bandcamp treats commas as query separators and rejects multiple terms.
	endpoint := "https://bandcamp.com/api/fuzzysearch/1/app_autocomplete?" + url.Values{
		"q":                    {strings.ReplaceAll(query, ",", " ")},
		"param_with_locations": {"true"},
	}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := bandcampClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bandcamp search: unexpected status %d", resp.StatusCode)
	}

	var out bandcampSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return mapBandcampResults(typ, out), nil
}

func mapBandcampResults(typ domain.SearchResultType, out bandcampSearchResponse) []domain.SearchResult {
	kind := bandcampSearchKinds[typ]
	var results []domain.SearchResult
	for _, item := range out.Results {
		if item.Type != kind || item.Name == "" || item.URL == "" {
			continue
		}
		result := domain.SearchResult{
			Type: typ, Title: item.Name, Source: "bandcamp", Origin: normalizeBandcampURL(item.URL),
			CoverURL: bandcampSearchCover(item),
		}
		if typ != domain.ResultArtist {
			result.Subtitle = item.BandName
		}
		results = append(results, result)
	}
	return results
}

func normalizeBandcampURL(raw string) string {
	for _, scheme := range []string{"https://", "http://"} {
		if !strings.HasPrefix(raw, scheme) {
			continue
		}
		if next := strings.Index(raw[len(scheme):], scheme); next >= 0 {
			return raw[len(scheme)+next:]
		}
		break
	}
	return raw
}

func bandcampSearchCover(item bandcampSearchItem) string {
	if item.ArtID != 0 {
		return fmt.Sprintf("https://f4.bcbits.com/img/a%d_0.png", item.ArtID)
	}
	if item.ImgID != 0 {
		return fmt.Sprintf("https://f4.bcbits.com/img/000%d_0.png", item.ImgID)
	}
	return ""
}

func (Bandcamp) ResolveTracks(ctx context.Context, url string, _ Config) ([]domain.ResolvedTrack, error) {
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

// ForgetStream drops the address held for this source.
func (Bandcamp) ForgetStream(sourceURL string, _ Config) {
	ytdlp.InvalidateStreamURL(strings.TrimPrefix(sourceURL, "bandcamp:"), "")
}

var (
	_ Searcher        = Bandcamp{}
	_ StreamForgetter = Bandcamp{}
	_ TrackResolver   = Bandcamp{}
	_ StreamResolver  = Bandcamp{}
)
