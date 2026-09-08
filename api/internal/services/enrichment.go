package services

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

const mbUserAgent = "MelodyManager/0.0.1 (https://github.com/melody-manager)"

var (
	mbMu   sync.Mutex
	mbLast time.Time
)

var enrichClient = &http.Client{Timeout: 15 * time.Second}

func mbFetch(ctx context.Context, u string) (*http.Response, error) {
	mbMu.Lock()
	if elapsed := time.Since(mbLast); elapsed < 1100*time.Millisecond {
		time.Sleep(1100*time.Millisecond - elapsed)
	}
	mbLast = time.Now()
	mbMu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", mbUserAgent)
	req.Header.Set("Accept", "application/json")
	return enrichClient.Do(req)
}

// EnrichAll fills missing album/artist covers and years from MusicBrainz /
// Cover Art Archive / Wikidata, as a background task.
func EnrichAll(ctx context.Context, app core.App, taskSvc *tasks.Service, taskID string) {
	artists, _ := app.FindRecordsByFilter("artists", "", "", 0, 0)
	albums, _ := app.FindRecordsByFilter("albums", "", "", 0, 0)
	total := len(artists) + len(albums)
	if total == 0 {
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Completed; t.Progress = 100 })
		return
	}
	taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Running })

	processed := 0
	bump := func() {
		processed++
		p := processed * 100 / total
		taskSvc.Update(taskID, func(t *tasks.Task) { t.Progress = p })
	}

	for _, a := range artists {
		enrichArtist(ctx, app, a)
		bump()
	}
	for _, a := range albums {
		enrichAlbum(ctx, app, a)
		bump()
	}
	taskSvc.Update(taskID, func(t *tasks.Task) { t.Status = tasks.Completed; t.Progress = 100 })
}

func enrichArtist(ctx context.Context, app core.App, artist *core.Record) {
	var meta map[string]any
	_ = artist.UnmarshalJSONField("metadata", &meta)
	if meta == nil {
		meta = map[string]any{}
	}
	hasCover := artist.GetString("cover") != ""
	mbid, _ := meta["mbid"].(string)
	if hasCover && mbid != "" {
		return
	}

	resMbid, wikidataID := mbSearchArtist(ctx, artist.GetString("name"))
	if resMbid != "" && mbid == "" {
		meta["mbid"] = resMbid
		artist.Set("metadata", meta)
		_ = app.Save(artist)
	}
	if !hasCover && wikidataID != "" {
		if img := wikidataImage(ctx, wikidataID); img != "" {
			setCoverFromURL(ctx, app, artist, img)
		}
	}
}

func enrichAlbum(ctx context.Context, app core.App, album *core.Record) {
	hasCover := album.GetString("cover") != ""
	hasYear := album.GetInt("year") != 0
	if hasCover && hasYear {
		return
	}
	artistIDs := album.GetStringSlice("artists")
	if len(artistIDs) == 0 {
		return
	}
	artist, err := app.FindRecordById("artists", artistIDs[0])
	if err != nil {
		return
	}

	mbid, year := mbSearchRelease(ctx, album.GetString("name"), artist.GetString("name"))
	if mbid == "" {
		return
	}
	if !hasYear && year != 0 {
		album.Set("year", year)
		_ = app.Save(album)
	}
	if !hasCover {
		if cover := mbCoverArtURL(ctx, mbid); cover != "" {
			setCoverFromURL(ctx, app, album, cover)
		}
	}
}

func setCoverFromURL(ctx context.Context, app core.App, rec *core.Record, u string) {
	f, err := filesystem.NewFileFromURL(ctx, u)
	if err != nil {
		return
	}
	rec.Set("cover", f)
	_ = app.Save(rec)
}

func mbSearchRelease(ctx context.Context, album, artist string) (string, int) {
	q := url.QueryEscape(fmt.Sprintf("release:%q AND artist:%q", album, artist))
	res, err := mbFetch(ctx, "https://musicbrainz.org/ws/2/release/?fmt=json&limit=1&query="+q)
	if err != nil {
		return "", 0
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", 0
	}
	var data struct {
		Releases []struct {
			ID   string `json:"id"`
			Date string `json:"date"`
		} `json:"releases"`
	}
	if json.NewDecoder(res.Body).Decode(&data) != nil || len(data.Releases) == 0 {
		return "", 0
	}
	r := data.Releases[0]
	year := 0
	if len(r.Date) >= 4 {
		year, _ = strconv.Atoi(r.Date[:4])
	}
	return r.ID, year
}

func mbCoverArtURL(ctx context.Context, mbid string) string {
	res, err := mbFetch(ctx, "https://coverartarchive.org/release/"+mbid+"/front-250")
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return ""
	}
	return res.Request.URL.String()
}

func mbSearchArtist(ctx context.Context, name string) (mbid, wikidataID string) {
	q := url.QueryEscape(fmt.Sprintf("artist:%q", name))
	res, err := mbFetch(ctx, "https://musicbrainz.org/ws/2/artist/?fmt=json&limit=1&query="+q)
	if err != nil {
		return "", ""
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", ""
	}
	var data struct {
		Artists []struct {
			ID    string `json:"id"`
			Score int    `json:"score"`
		} `json:"artists"`
	}
	_ = json.NewDecoder(res.Body).Decode(&data)
	res.Body.Close()
	if len(data.Artists) == 0 || data.Artists[0].Score < 80 {
		return "", ""
	}
	mbid = data.Artists[0].ID

	detail, err := mbFetch(ctx, "https://musicbrainz.org/ws/2/artist/"+mbid+"?inc=url-rels&fmt=json")
	if err != nil || detail.StatusCode != 200 {
		return mbid, ""
	}
	defer detail.Body.Close()
	var d struct {
		Relations []struct {
			Type string `json:"type"`
			URL  struct {
				Resource string `json:"resource"`
			} `json:"url"`
		} `json:"relations"`
	}
	if json.NewDecoder(detail.Body).Decode(&d) == nil {
		for _, rel := range d.Relations {
			if rel.Type == "wikidata" {
				if i := strings.LastIndex(rel.URL.Resource, "/Q"); i >= 0 {
					wikidataID = rel.URL.Resource[i+1:]
				}
			}
		}
	}
	return mbid, wikidataID
}

func wikidataImage(ctx context.Context, wikidataID string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.wikidata.org/wiki/Special:EntityData/"+wikidataID+".json", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", mbUserAgent)
	res, err := enrichClient.Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return ""
	}
	var data struct {
		Entities map[string]struct {
			Claims struct {
				P18 []struct {
					Mainsnak struct {
						Datavalue struct {
							Value string `json:"value"`
						} `json:"datavalue"`
					} `json:"mainsnak"`
				} `json:"P18"`
			} `json:"claims"`
		} `json:"entities"`
	}
	if json.NewDecoder(res.Body).Decode(&data) != nil {
		return ""
	}
	ent, ok := data.Entities[wikidataID]
	if !ok || len(ent.Claims.P18) == 0 {
		return ""
	}
	file := ent.Claims.P18[0].Mainsnak.Datavalue.Value
	if file == "" {
		return ""
	}
	normalized := strings.ReplaceAll(file, " ", "_")
	sum := md5.Sum([]byte(normalized))
	h := hex.EncodeToString(sum[:])
	return fmt.Sprintf("https://upload.wikimedia.org/wikipedia/commons/thumb/%c/%c%c/%s/250px-%s", h[0], h[0], h[1], normalized, normalized)
}
