package services

import (
	_ "embed"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

//go:embed assets/most-played.svg
var coverMostPlayed []byte

//go:embed assets/liked-tracks.svg
var coverLiked []byte

//go:embed assets/discovery.svg
var coverDiscovery []byte

const (
	smartRefreshInterval = 6 * time.Hour
	smartDefaultLimit    = 50
	minPlaysForAuto      = 10
	minLikesForAuto      = 5
)

type smartDefault struct {
	name      string
	strategy  string
	coverName string
	cover     []byte
	canCreate func(plays, likes int) bool
}

var smartDefaults = []smartDefault{
	{"most-played", "top-tracks", "most-played.svg", coverMostPlayed, func(p, _ int) bool { return p >= minPlaysForAuto }},
	{"liked-tracks", "liked", "liked-tracks.svg", coverLiked, func(_, l int) bool { return l >= minLikesForAuto }},
	{"discovery", "discovery", "discovery.svg", coverDiscovery, func(p, _ int) bool { return p >= minPlaysForAuto }},
}

type playlistMeta struct {
	Strategy string `json:"strategy"`
	GenreID  string `json:"genreId"`
	ArtistID string `json:"artistId"`
	Limit    int    `json:"limit"`
}

// RefreshSmartPlaylists auto-creates the default smart playlists for a user
// (when play/like thresholds are met) and refreshes stale ones. Safe to call in
// a goroutine on every play/like.
// refreshLocks serialises refreshes per user. The play/like hook spawns one
// goroutine per event, and two concurrent runs would each miss the other's
// freshly created playlist and create a duplicate.
var refreshLocks sync.Map

func RefreshSmartPlaylists(app core.App, userID string) {
	lock, _ := refreshLocks.LoadOrStore(userID, &sync.Mutex{})
	mu := lock.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	likes, err := app.FindRecordsByFilter("playlist_likes", "user = {:u}", "", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		return
	}
	var smart []*core.Record
	existing := map[string]bool{}
	for _, l := range likes {
		p, err := app.FindRecordById("playlists", l.GetString("playlist"))
		if err != nil || p.GetString("type") != "smart" {
			continue
		}
		var meta playlistMeta
		if err := p.UnmarshalJSONField("metadata", &meta); err != nil || meta.Strategy == "" {
			continue
		}
		smart = append(smart, p)
		existing[meta.Strategy] = true
	}

	playCount := len(completedPlays(app, userID))
	likeCount := len(likedTrackIDs(app, userID))
	for _, def := range smartDefaults {
		if existing[def.strategy] || !def.canCreate(playCount, likeCount) {
			continue
		}
		createSmartPlaylist(app, userID, def)
	}

	now := time.Now()
	for _, p := range smart {
		if now.Sub(p.GetDateTime("updated").Time()) < smartRefreshInterval {
			continue
		}
		refreshSmartPlaylist(app, p, userID)
	}
}

func createSmartPlaylist(app core.App, userID string, def smartDefault) {
	col, err := app.FindCollectionByNameOrId("playlists")
	if err != nil {
		return
	}
	rec := core.NewRecord(col)
	rec.Set("name", def.name)
	rec.Set("type", "smart")
	rec.Set("metadata", map[string]any{"strategy": def.strategy, "limit": smartDefaultLimit})
	rec.Set("tracks", []string{})
	if f, err := filesystem.NewFileFromBytes(def.cover, def.coverName); err == nil {
		rec.Set("cover", f)
	}
	if err := app.Save(rec); err != nil {
		return
	}

	likeCol, err := app.FindCollectionByNameOrId("playlist_likes")
	if err == nil {
		like := core.NewRecord(likeCol)
		like.Set("user", userID)
		like.Set("playlist", rec.Id)
		_ = app.Save(like)
	}
	refreshSmartPlaylist(app, rec, userID)
}

func refreshSmartPlaylist(app core.App, playlist *core.Record, userID string) {
	var meta playlistMeta
	if err := playlist.UnmarshalJSONField("metadata", &meta); err != nil || meta.Strategy == "" {
		return
	}
	limit := meta.Limit
	if limit == 0 {
		limit = smartDefaultLimit
	}

	var trackIDs []string
	switch meta.Strategy {
	case "top-tracks":
		trackIDs = topTrackIDs(app, userID, limit)
	case "liked":
		trackIDs = likedMinusDisliked(app, userID, limit)
	case "discovery":
		trackIDs = discoveryTrackIDs(app, userID, limit)
	case "top-genre":
		trackIDs = byRelation(app, userID, "genres", meta.GenreID, limit)
	case "top-artist":
		trackIDs = byRelation(app, userID, "artists", meta.ArtistID, limit)
	default:
		return
	}

	playlist.Set("tracks", trackIDs)
	_ = app.Save(playlist)
}

func completedPlays(app core.App, userID string) map[string]int {
	counts := map[string]int{}
	recs, err := app.FindRecordsByFilter("track_plays", "user = {:u} && completed = true", "", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		return counts
	}
	for _, r := range recs {
		counts[r.GetString("track")]++
	}
	return counts
}

func likedTrackIDs(app core.App, userID string) []string {
	recs, err := app.FindRecordsByFilter("track_likes", "user = {:u}", "", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		return nil
	}
	ids := make([]string, 0, len(recs))
	for _, r := range recs {
		ids = append(ids, r.GetString("track"))
	}
	return ids
}

func dislikedTrackIDs(app core.App, userID string) map[string]bool {
	set := map[string]bool{}
	recs, err := app.FindRecordsByFilter("track_dislikes", "user = {:u}", "", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		return set
	}
	for _, r := range recs {
		set[r.GetString("track")] = true
	}
	return set
}

func topTrackIDs(app core.App, userID string, limit int) []string {
	counts := completedPlays(app, userID)
	type kv struct {
		id string
		n  int
	}
	pairs := make([]kv, 0, len(counts))
	for id, n := range counts {
		pairs = append(pairs, kv{id, n})
	}
	sort.SliceStable(pairs, func(i, j int) bool { return pairs[i].n > pairs[j].n })
	out := make([]string, 0, limit)
	for i := 0; i < len(pairs) && i < limit; i++ {
		out = append(out, pairs[i].id)
	}
	return out
}

func likedMinusDisliked(app core.App, userID string, limit int) []string {
	disliked := dislikedTrackIDs(app, userID)
	out := make([]string, 0, limit)
	for _, id := range likedTrackIDs(app, userID) {
		if disliked[id] {
			continue
		}
		out = append(out, id)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func byRelation(app core.App, userID, field, value string, limit int) []string {
	if value == "" {
		return nil
	}
	counts := completedPlays(app, userID)
	tracks, err := app.FindRecordsByFilter("tracks", "", "", 0, 0)
	if err != nil {
		return nil
	}
	type kv struct {
		id string
		n  int
	}
	var pairs []kv
	for _, t := range tracks {
		if !contains(t.GetStringSlice(field), value) {
			continue
		}
		pairs = append(pairs, kv{t.Id, counts[t.Id]})
	}
	sort.SliceStable(pairs, func(i, j int) bool { return pairs[i].n > pairs[j].n })
	out := make([]string, 0, limit)
	for i := 0; i < len(pairs) && i < limit; i++ {
		out = append(out, pairs[i].id)
	}
	return out
}

func discoveryTrackIDs(app core.App, userID string, limit int) []string {
	counts := completedPlays(app, userID)
	if len(counts) == 0 {
		return nil
	}
	tracks, err := app.FindRecordsByFilter("tracks", "", "", 0, 0)
	if err != nil {
		return nil
	}

	genreW, artistW := map[string]int{}, map[string]int{}
	for _, t := range tracks {
		c, played := counts[t.Id]
		if !played {
			continue
		}
		for _, g := range t.GetStringSlice("genres") {
			genreW[g] += c
		}
		for _, a := range t.GetStringSlice("artists") {
			artistW[a] += c
		}
	}
	topGenres := topKeys(genreW, 5)
	topArtists := topKeys(artistW, 10)

	var matched, others []string
	for _, t := range tracks {
		if _, played := counts[t.Id]; played {
			continue
		}
		if anyIn(t.GetStringSlice("genres"), topGenres) || anyIn(t.GetStringSlice("artists"), topArtists) {
			matched = append(matched, t.Id)
		} else {
			others = append(others, t.Id)
		}
	}
	pool := matched
	if len(pool) < limit {
		pool = append(pool, others...)
	}
	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	if len(pool) > limit {
		pool = pool[:limit]
	}
	return pool
}

func topKeys(m map[string]int, n int) []string {
	type kv struct {
		k string
		v int
	}
	pairs := make([]kv, 0, len(m))
	for k, v := range m {
		pairs = append(pairs, kv{k, v})
	}
	sort.SliceStable(pairs, func(i, j int) bool { return pairs[i].v > pairs[j].v })
	out := make([]string, 0, n)
	for i := 0; i < len(pairs) && i < n; i++ {
		out = append(out, pairs[i].k)
	}
	return out
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func anyIn(s, set []string) bool {
	for _, x := range s {
		if contains(set, x) {
			return true
		}
	}
	return false
}
