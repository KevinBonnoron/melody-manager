package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// OwnsItsLibrary reports whether a source's server configuration *is* its
// library: the files the operator pointed the server at. Dropping that
// configuration drops the library with it.
//
// Every other source keeps its tracks: a download path is a cache's address,
// and forgetting it costs the copy, not the track.
func OwnsItsLibrary(providerType string) bool {
	mf, ok := providers.ManifestFor(providerType)
	if !ok || mf.Scope != "public" {
		return false
	}

	for _, feature := range mf.Features {
		if feature == "import" {
			return true
		}
	}

	return false
}

// DropSourceLibrary removes what a source put in the library, and the albums
// and artists that nothing points at afterwards. Returns the number of tracks
// removed.
func DropSourceLibrary(app core.App, providerType string) (int, error) {
	tracks, err := app.FindRecordsByFilter("tracks", "source = {:s}", "", 0, 0, dbx.Params{"s": providerType})
	if err != nil {
		return 0, err
	}

	albums := map[string]bool{}
	artists := map[string]bool{}
	for _, track := range tracks {
		albums[track.GetString("album")] = true
		for _, id := range track.GetStringSlice("artists") {
			artists[id] = true
		}
		if err := app.Delete(track); err != nil {
			return 0, err
		}
	}

	for id := range albums {
		deleteIfUnused(app, "albums", id, "album = {:id}")
	}
	for id := range artists {
		deleteIfUnused(app, "artists", id, "artists ~ {:id}")
	}

	return len(tracks), nil
}

// Through the filter DSL rather than CountRecords, which takes raw SQL: "~" is
// not an SQL operator, so counting the tracks still pointing at an artist
// errored out and every artist survived the album it was on.
func deleteIfUnused(app core.App, collection, id, trackFilter string) {
	if id == "" {
		return
	}

	used, err := app.FindRecordsByFilter("tracks", trackFilter, "", 1, 0, dbx.Params{"id": id})
	if err != nil || len(used) > 0 {
		return
	}

	if rec, err := app.FindRecordById(collection, id); err == nil {
		_ = app.Delete(rec)
	}
}
