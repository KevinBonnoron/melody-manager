package services

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func TestCheckLibraryReusesMetadataWithinOnePass(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	defer app.ResetBootstrapState()

	artists := core.NewBaseCollection("artists")
	artists.Fields.Add(&core.TextField{Name: "name", Required: true})
	if err := app.Save(artists); err != nil {
		t.Fatal(err)
	}
	albums := core.NewBaseCollection("albums")
	albums.Fields.Add(
		&core.TextField{Name: "name", Required: true},
		&core.RelationField{Name: "artists", CollectionId: artists.Id, MaxSelect: 10},
	)
	if err := app.Save(albums); err != nil {
		t.Fatal(err)
	}
	tracks := core.NewBaseCollection("tracks")
	tracks.Fields.Add(
		&core.TextField{Name: "title", Required: true},
		&core.TextField{Name: "origin"},
		&core.TextField{Name: "source"},
		&core.TextField{Name: "availability"},
		&core.RelationField{Name: "album", CollectionId: albums.Id, MaxSelect: 1},
		&core.RelationField{Name: "artists", CollectionId: artists.Id, MaxSelect: 10},
	)
	if err := app.Save(tracks); err != nil {
		t.Fatal(err)
	}
	configs := core.NewBaseCollection("provider_config")
	configs.Fields.Add(&core.TextField{Name: "type", Required: true}, &core.JSONField{Name: "config"})
	if err := app.Save(configs); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	config := core.NewRecord(configs)
	config.Set("type", "youtube")
	config.Set("config", map[string]any{"downloadPath": root})
	if err := app.Save(config); err != nil {
		t.Fatal(err)
	}
	createArtist := func(name string) *core.Record {
		t.Helper()
		record := core.NewRecord(artists)
		record.Set("name", name)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	first, second := createArtist("Artist A"), createArtist("Artist B")
	album := core.NewRecord(albums)
	album.Set("name", "Album")
	album.Set("artists", []string{first.Id})
	if err := app.Save(album); err != nil {
		t.Fatal(err)
	}
	createTrack := func(title, artistID string) *core.Record {
		t.Helper()
		record := core.NewRecord(tracks)
		record.Set("title", title)
		record.Set("origin", "https://example.test/"+title)
		record.Set("source", "youtube")
		record.Set("album", album.Id)
		if artistID != "" {
			record.Set("artists", []string{artistID})
		}
		record.Set("availability", AvailabilityFile)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	createTrack("One", first.Id)
	createTrack("Two", "") // falls back to the album artist
	third := createTrack("Three", second.Id)
	writeTrack := func(artist, filename string) string {
		t.Helper()
		dir := filepath.Join(root, artist, "Album")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, filename)
		if err := os.WriteFile(path, []byte("audio"), 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	writeTrack("Artist A", "01 - One.mp3")
	writeTrack("Artist A", "02 - Two.mp3")
	thirdPath := writeTrack("Artist B", "03 - Three.mp3")

	db, ok := app.ConcurrentDB().(*dbx.DB)
	if !ok {
		t.Fatal("unexpected PocketBase concurrent DB type")
	}
	var albumReads, artistReads int
	db.QueryLogFunc = func(_ context.Context, _ time.Duration, query string, _ *sql.Rows, _ error) {
		if strings.Contains(query, "FROM `albums`") {
			albumReads++
		}
		if strings.Contains(query, "FROM `artists`") {
			artistReads++
		}
	}
	result, err := CheckLibrary(context.Background(), app)
	if err != nil {
		t.Fatal(err)
	}
	if result.Checked != 3 || result.Changed != 0 {
		t.Fatalf("initial check = %+v", result)
	}
	if albumReads != 1 || artistReads != 2 {
		t.Fatalf("metadata reads = %d albums, %d artists; want one per distinct record", albumReads, artistReads)
	}
	db.QueryLogFunc = nil

	if err := os.Remove(thirdPath); err != nil {
		t.Fatal(err)
	}
	result, err = CheckLibrary(context.Background(), app)
	if err != nil || result.Changed != 1 {
		t.Fatalf("missing file check = %+v, %v", result, err)
	}
	updated, err := app.FindRecordById("tracks", third.Id)
	if err != nil || updated.GetString("availability") != AvailabilityStream {
		t.Fatalf("missing file availability = %v, %v", updated, err)
	}

	second.Set("name", "Renamed Artist")
	if err := app.Save(second); err != nil {
		t.Fatal(err)
	}
	writeTrack("Renamed Artist", "03 - Three.mp3")
	result, err = CheckLibrary(context.Background(), app)
	if err != nil || result.Changed != 1 {
		t.Fatalf("renamed artist check = %+v, %v", result, err)
	}
	updated, err = app.FindRecordById("tracks", third.Id)
	if err != nil || updated.GetString("availability") != AvailabilityFile {
		t.Fatalf("restored file availability = %v, %v", updated, err)
	}
}
