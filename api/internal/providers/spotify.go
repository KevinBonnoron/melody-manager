package providers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

var spotifyClient = &http.Client{Timeout: 15 * time.Second}

// Spotify is catalog-only: it provides metadata via the Web API (app
// client-credentials from provider_settings.config), and actual playback is
// resolved through YouTube by the stream service. Per-user OAuth (for private
// library import) is a follow-up.
type Spotify struct{}

func (Spotify) ID() string { return "spotify" }

var spotifyTokens sync.Map // clientID -> *spotifyToken

type spotifyToken struct {
	value  string
	expiry time.Time
}

func spotifyAccessToken(ctx context.Context, cfg Config) (string, error) {
	id, secret := cfg.String("clientId"), cfg.String("clientSecret")
	if id == "" || secret == "" {
		return "", fmt.Errorf("spotify: missing clientId/clientSecret (configure in provider settings)")
	}
	if v, ok := spotifyTokens.Load(id); ok {
		t := v.(*spotifyToken)
		if time.Now().Before(t.expiry) {
			return t.value, nil
		}
	}

	body := strings.NewReader("grant_type=client_credentials")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://accounts.spotify.com/api/token", body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(id+":"+secret)))

	resp, err := spotifyClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("spotify token: status %d", resp.StatusCode)
	}
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	spotifyTokens.Store(id, &spotifyToken{
		value:  out.AccessToken,
		expiry: time.Now().Add(time.Duration(out.ExpiresIn-30) * time.Second),
	})
	return out.AccessToken, nil
}

type spotifyImage struct {
	URL string `json:"url"`
}

type spotifyExternal struct {
	Spotify string `json:"spotify"`
}

type spotifyArtistRef struct {
	Name string `json:"name"`
}

// spotifySearchResponse covers the four sections the Web API can return; only
// the one matching the requested type is populated.
type spotifySearchResponse struct {
	Tracks struct {
		Items []struct {
			Name        string             `json:"name"`
			Artists     []spotifyArtistRef `json:"artists"`
			DurationMs  int                `json:"duration_ms"`
			ExternalURL spotifyExternal    `json:"external_urls"`
			Album       struct {
				Images []spotifyImage `json:"images"`
			} `json:"album"`
		} `json:"items"`
	} `json:"tracks"`
	Albums struct {
		Items []struct {
			Name        string             `json:"name"`
			Artists     []spotifyArtistRef `json:"artists"`
			Images      []spotifyImage     `json:"images"`
			ExternalURL spotifyExternal    `json:"external_urls"`
		} `json:"items"`
	} `json:"albums"`
	Artists struct {
		Items []struct {
			Name        string          `json:"name"`
			Images      []spotifyImage  `json:"images"`
			ExternalURL spotifyExternal `json:"external_urls"`
		} `json:"items"`
	} `json:"artists"`
	Playlists struct {
		// Spotify occasionally returns null entries here.
		Items []*struct {
			Name        string          `json:"name"`
			Images      []spotifyImage  `json:"images"`
			ExternalURL spotifyExternal `json:"external_urls"`
			Owner       struct {
				DisplayName string `json:"display_name"`
			} `json:"owner"`
		} `json:"items"`
	} `json:"playlists"`
}

var spotifySearchKinds = map[domain.SearchResultType]string{
	domain.ResultTrack:    "track",
	domain.ResultAlbum:    "album",
	domain.ResultArtist:   "artist",
	domain.ResultPlaylist: "playlist",
}

func firstImage(images []spotifyImage) string {
	if len(images) == 0 {
		return ""
	}
	return images[0].URL
}

func firstArtist(artists []spotifyArtistRef) string {
	if len(artists) == 0 {
		return ""
	}
	return artists[0].Name
}

func (Spotify) Search(ctx context.Context, query string, typ domain.SearchResultType, cfg Config) ([]domain.SearchResult, error) {
	kind, ok := spotifySearchKinds[typ]
	if !ok {
		return nil, nil
	}
	token, err := spotifyAccessToken(ctx, cfg)
	if err != nil {
		return nil, err
	}
	endpoint := "https://api.spotify.com/v1/search?limit=20&type=" + kind + "&q=" + url.QueryEscape(query)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := spotifyClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("spotify search: unexpected status %d", resp.StatusCode)
	}

	var out spotifySearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	return mapSpotifyResults(typ, out), nil
}

// mapSpotifyResults projects the section matching typ onto the unified result
// shape.
func mapSpotifyResults(typ domain.SearchResultType, out spotifySearchResponse) []domain.SearchResult {
	var results []domain.SearchResult
	switch typ {
	case domain.ResultTrack:
		for _, it := range out.Tracks.Items {
			results = append(results, domain.SearchResult{
				Type: domain.ResultTrack, Title: it.Name, Subtitle: firstArtist(it.Artists),
				Source: "spotify", SourceURL: it.ExternalURL.Spotify,
				CoverURL: firstImage(it.Album.Images), Duration: it.DurationMs / 1000,
			})
		}
	case domain.ResultAlbum:
		for _, it := range out.Albums.Items {
			results = append(results, domain.SearchResult{
				Type: domain.ResultAlbum, Title: it.Name, Subtitle: firstArtist(it.Artists),
				Source: "spotify", SourceURL: it.ExternalURL.Spotify, CoverURL: firstImage(it.Images),
			})
		}
	case domain.ResultArtist:
		for _, it := range out.Artists.Items {
			results = append(results, domain.SearchResult{
				Type: domain.ResultArtist, Title: it.Name,
				Source: "spotify", SourceURL: it.ExternalURL.Spotify, CoverURL: firstImage(it.Images),
			})
		}
	case domain.ResultPlaylist:
		for _, it := range out.Playlists.Items {
			if it == nil || it.Name == "" {
				continue
			}
			results = append(results, domain.SearchResult{
				Type: domain.ResultPlaylist, Title: it.Name, Subtitle: it.Owner.DisplayName,
				Source: "spotify", SourceURL: it.ExternalURL.Spotify, CoverURL: firstImage(it.Images),
			})
		}
	}
	return results
}

var _ Searcher = Spotify{}
