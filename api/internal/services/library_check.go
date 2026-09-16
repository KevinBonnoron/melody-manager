package services

import (
	"context"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const localSource = "local"

const (
	AvailabilityFile   = "file"   // held on this server's disk
	AvailabilityStream = "stream" // fetched from the provider on demand
	AvailabilityNone   = "none"   // nowhere: the track cannot be played
)

// CheckResult counts what a pass over the library changed.
type CheckResult struct {
	Checked int `json:"checked"`
	Changed int `json:"changed"`
	Lost    int `json:"lost"`
}

// CheckLibrary records where each track's audio can be read from.
func CheckLibrary(ctx context.Context, app core.App) (CheckResult, error) {
	records, err := app.FindAllRecords("tracks")
	if err != nil {
		return CheckResult{}, err
	}
	return checkTracks(ctx, app, records)
}

// CheckAlbum records where one album's tracks can be read from.
func CheckAlbum(ctx context.Context, app core.App, albumID string) (CheckResult, error) {
	records, err := app.FindRecordsByFilter("tracks", "album = {:a}", "", 0, 0, dbx.Params{"a": albumID})
	if err != nil {
		return CheckResult{}, err
	}
	return checkTracks(ctx, app, records)
}

func checkTracks(ctx context.Context, app core.App, records []*core.Record) (CheckResult, error) {
	var result CheckResult
	roots := localRoots(app)
	for _, rec := range records {
		if err := ctx.Err(); err != nil {
			return result, err
		}

		result.Checked++
		next := availabilityOf(app, rec, roots)
		if next == rec.GetString("availability") {
			continue
		}

		rec.Set("availability", next)
		if err := app.Save(rec); err != nil {
			return result, err
		}

		result.Changed++
		if next == AvailabilityNone {
			result.Lost++
		}
	}

	return result, nil
}

func availabilityOf(app core.App, track *core.Record, roots []string) string {
	if localFile(app, track, roots) != "" {
		return AvailabilityFile
	}
	if track.GetString("source") == localSource {
		return AvailabilityNone
	}
	return AvailabilityStream
}
