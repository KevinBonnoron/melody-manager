package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const topLimit = 20

type countRow struct {
	ID    string `db:"id"`
	Count int    `db:"count"`
}

type monthRow struct {
	Month string `db:"month"`
	Count int    `db:"count"`
}

// Overview returns aggregate listening stats for a user, in the shape the
// stats page consumes (see StatsData in src/components/stats/stats-page.tsx).
func Overview(app core.App, userID string) map[string]any {
	params := dbx.Params{"u": userID}

	var totals struct {
		Plays   int `db:"plays"`
		Seconds int `db:"seconds"`
		Tracks  int `db:"tracks"`
	}
	_ = app.DB().NewQuery(`
		SELECT COUNT(*) AS plays,
		       COALESCE(SUM(t.duration), 0) AS seconds,
		       COUNT(DISTINCT tp.track) AS tracks
		FROM track_plays tp
		JOIN tracks t ON t.id = tp.track
		WHERE tp.user = {:u}`).Bind(params).One(&totals)

	topTracks := groupCount(app, `
		SELECT tp.track AS id, COUNT(*) AS count
		FROM track_plays tp
		WHERE tp.user = {:u}
		GROUP BY tp.track ORDER BY count DESC LIMIT {:n}`, params)

	topAlbums := groupCount(app, `
		SELECT t.album AS id, COUNT(*) AS count
		FROM track_plays tp JOIN tracks t ON t.id = tp.track
		WHERE tp.user = {:u} AND t.album != ''
		GROUP BY t.album ORDER BY count DESC LIMIT {:n}`, params)

	// artists and genres are multi-relations, stored as JSON arrays.
	topArtists := groupCount(app, `
		SELECT je.value AS id, COUNT(*) AS count
		FROM track_plays tp JOIN tracks t ON t.id = tp.track, json_each(t.artists) je
		WHERE tp.user = {:u}
		GROUP BY je.value ORDER BY count DESC LIMIT {:n}`, params)

	topGenres := groupCount(app, `
		SELECT je.value AS id, COUNT(*) AS count
		FROM track_plays tp JOIN tracks t ON t.id = tp.track, json_each(t.genres) je
		WHERE tp.user = {:u}
		GROUP BY je.value ORDER BY count DESC LIMIT {:n}`, params)

	var uniqueArtists struct {
		N int `db:"n"`
	}
	_ = app.DB().NewQuery(`
		SELECT COUNT(DISTINCT je.value) AS n
		FROM track_plays tp JOIN tracks t ON t.id = tp.track, json_each(t.artists) je
		WHERE tp.user = {:u}`).Bind(params).One(&uniqueArtists)

	var months []monthRow
	_ = app.DB().NewQuery(`
		SELECT substr(tp.created, 1, 7) AS month, COUNT(*) AS count
		FROM track_plays tp
		WHERE tp.user = {:u}
		GROUP BY month ORDER BY month`).Bind(params).All(&months)
	playsByMonth := make([]map[string]any, 0, len(months))
	for _, m := range months {
		playsByMonth = append(playsByMonth, map[string]any{"month": m.Month, "count": m.Count})
	}

	return map[string]any{
		"totalPlays":    totals.Plays,
		"totalSeconds":  totals.Seconds,
		"uniqueTracks":  totals.Tracks,
		"uniqueArtists": uniqueArtists.N,
		"topTracks":     keyed(topTracks, "trackId"),
		"topArtists":    keyed(topArtists, "artistId"),
		"topAlbums":     keyed(topAlbums, "albumId"),
		"topGenres":     keyed(topGenres, "genreId"),
		"playsByMonth":  playsByMonth,
	}
}

// PlayCounts returns per-track play counts for a user, keyed by track id.
func PlayCounts(app core.App, userID string) map[string]int {
	rows := groupCount(app, `
		SELECT track AS id, COUNT(*) AS count
		FROM track_plays WHERE user = {:u} GROUP BY track`, dbx.Params{"u": userID})
	out := make(map[string]int, len(rows))
	for _, r := range rows {
		out[r.ID] = r.Count
	}
	return out
}

func groupCount(app core.App, sql string, params dbx.Params) []countRow {
	bound := dbx.Params{"n": topLimit}
	for k, v := range params {
		bound[k] = v
	}
	var rows []countRow
	_ = app.DB().NewQuery(sql).Bind(bound).All(&rows)
	return rows
}

func keyed(rows []countRow, idKey string) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{idKey: r.ID, "count": r.Count})
	}
	return out
}
