package covers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const userAgent = "MelodyManager/0.0.1 (https://github.com/melody-manager)"

// MusicBrainz asks for one request per second per client; going faster earns a
// 503 for the whole application, so every call funnels through this gate.
var (
	rateMu   sync.Mutex
	rateLast time.Time
)

var client = &http.Client{Timeout: 15 * time.Second}

type musicBrainz struct{}

func (musicBrainz) Name() string { return "musicbrainz" }

func (musicBrainz) AlbumCover(ctx context.Context, album, artist string) (string, error) {
	mbid, err := releaseID(ctx, album, artist)
	if err != nil || mbid == "" {
		return "", err
	}
	return coverArtURL(ctx, mbid)
}

func fetch(ctx context.Context, u string) (*http.Response, error) {
	rateMu.Lock()
	if elapsed := time.Since(rateLast); elapsed < 1100*time.Millisecond {
		time.Sleep(1100*time.Millisecond - elapsed)
	}
	rateLast = time.Now()
	rateMu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	return client.Do(req)
}

func releaseID(ctx context.Context, album, artist string) (string, error) {
	q := url.QueryEscape(fmt.Sprintf("release:%q AND artist:%q", album, artist))
	res, err := fetch(ctx, "https://musicbrainz.org/ws/2/release/?fmt=json&limit=1&query="+q)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("musicbrainz search: %s", res.Status)
	}
	var data struct {
		Releases []struct {
			ID    string `json:"id"`
			Score int    `json:"score"`
		} `json:"releases"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return "", err
	}
	// A weak match returns an unrelated release rather than nothing, which
	// would staple a stranger's artwork onto the album.
	if len(data.Releases) == 0 || data.Releases[0].Score < 90 {
		return "", nil
	}
	return data.Releases[0].ID, nil
}

func coverArtURL(ctx context.Context, mbid string) (string, error) {
	res, err := fetch(ctx, "https://coverartarchive.org/release/"+mbid+"/front-500")
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", nil
	}
	return res.Request.URL.String(), nil
}
