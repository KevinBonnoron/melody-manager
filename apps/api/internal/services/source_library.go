package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// OwnsItsLibrary reports whether a source's server configuration *is* its library: the files
// the operator pointed the server at.
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

// DropSourceLibrary removes what a source put in the library, and the albums and artists that
// nothing points at afterwards.
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
