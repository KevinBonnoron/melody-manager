package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type regroupFixture struct {
	t      *testing.T
	app    core.App
	root   string
	artist *core.Record
}

func newRegroupFixture(t *testing.T) *regroupFixture {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	save := func(c *core.Collection) *core.Collection {
		t.Helper()
		if err := app.Save(c); err != nil {
			t.Fatal(err)
		}
		return c
	}
	artists := core.NewBaseCollection("artists")
	artists.Fields.Add(&core.TextField{Name: "name", Required: true})
	save(artists)
	albums := core.NewBaseCollection("albums")
	albums.Fields.Add(
		&core.TextField{Name: "name", Required: true},
		&core.NumberField{Name: "year"},
		&core.SelectField{Name: "type", MaxSelect: 1, Values: []string{"single", "ep", "album", "mix"}},
		&core.BoolField{Name: "typeLocked"},
		&core.BoolField{Name: "typeIncomplete"},
		&core.TextField{Name: "videoOrigin"},
		&core.RelationField{Name: "artists", CollectionId: artists.Id, MaxSelect: 10},
	)
	save(albums)
	tracks := core.NewBaseCollection("tracks")
	tracks.Fields.Add(
		&core.TextField{Name: "title", Required: true},
		&core.TextField{Name: "origin"},
		&core.TextField{Name: "source"},
		&core.TextField{Name: "availability"},
		&core.NumberField{Name: "duration"},
		&core.JSONField{Name: "metadata"},
		&core.RelationField{Name: "album", CollectionId: albums.Id, MaxSelect: 1, CascadeDelete: true},
		&core.RelationField{Name: "artists", CollectionId: artists.Id, MaxSelect: 10},
	)
	save(tracks)
	ratings := core.NewBaseCollection("album_ratings")
	ratings.Fields.Add(
		&core.TextField{Name: "user"},
		&core.TextField{Name: "value"},
		&core.RelationField{Name: "album", CollectionId: albums.Id, MaxSelect: 1, CascadeDelete: true},
	)
	save(ratings)
	configs := core.NewBaseCollection("provider_config")
	configs.Fields.Add(&core.TextField{Name: "type", Required: true}, &core.JSONField{Name: "config"})
	save(configs)

	f := &regroupFixture{t: t, app: app, root: t.TempDir()}
	config := core.NewRecord(configs)
	config.Set("type", "youtube")
	config.Set("config", map[string]any{"downloadPath": f.root})
	f.save(config)

	f.artist = core.NewRecord(artists)
	f.artist.Set("name", "Channel")
	f.save(f.artist)
	return f
}

func (f *regroupFixture) save(r *core.Record) *core.Record {
	f.t.Helper()
	if err := f.app.Save(r); err != nil {
		f.t.Fatal(err)
	}
	return r
}

func (f *regroupFixture) album(name string) *core.Record {
	c, _ := f.app.FindCollectionByNameOrId("albums")
	r := core.NewRecord(c)
	r.Set("name", name)
	r.Set("artists", []string{f.artist.Id})
	return f.save(r)
}

// track makes a downloaded YouTube track whose file sits where the library looks for it.
func (f *regroupFixture) track(album *core.Record, title string, metadata map[string]any) *core.Record {
	c, _ := f.app.FindCollectionByNameOrId("tracks")
	r := core.NewRecord(c)
	r.Set("title", title)
	r.Set("origin", "https://youtu.be/"+title)
	r.Set("source", "youtube")
	r.Set("availability", AvailabilityFile)
	r.Set("duration", 200)
	r.Set("album", album.Id)
	r.Set("artists", []string{f.artist.Id})
	if metadata != nil {
		r.Set("metadata", metadata)
	}
	f.save(r)

	dir := filepath.Join(f.root, "Channel", AlbumDirectoryName(album))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		f.t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "01 - "+title+".m4a"), []byte(title), 0o644); err != nil {
		f.t.Fatal(err)
	}
	return r
}

func (f *regroupFixture) file(album, title string) bool {
	_, err := os.Stat(filepath.Join(f.root, "Channel", sanitizeFilename(album), "01 - "+title+".m4a"))
	return err == nil
}

func (f *regroupFixture) albumsNamed(name string) []*core.Record {
	recs, err := f.app.FindRecordsByFilter("albums", "name = {:n}", "", 0, 0, dbx.Params{"n": name})
	if err != nil {
		f.t.Fatal(err)
	}
	return recs
}

func TestMovingTheLastTrackOutRemovesTheAlbumAndCarriesTheFile(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("Lonely"), f.album("Record")
	track := f.track(from, "Song", nil)
	f.track(into, "Other", nil)

	if err := MoveTracks(f.app, []string{track.Id}, into.Id); err != nil {
		t.Fatal(err)
	}

	if len(f.albumsNamed("Lonely")) != 0 {
		t.Fatal("the emptied album is still there")
	}
	if !f.file("Record", "Song") || f.file("Lonely", "Song") {
		t.Fatal("the downloaded file did not follow its track")
	}
	if _, err := os.Stat(filepath.Join(f.root, "Channel", "Lonely")); !os.IsNotExist(err) {
		t.Fatal("the emptied folder was left behind")
	}
	got, _ := f.app.FindRecordById("albums", into.Id)
	if got.GetString("type") != "single" {
		t.Fatalf("type of a two-track short album = %q, want single", got.GetString("type"))
	}
}

func TestMovingATrackOntoAFileAlreadyThereChangesNothing(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("From"), f.album("Into")
	track := f.track(from, "Song", nil)
	f.track(into, "Song", nil)

	if err := MoveTracks(f.app, []string{track.Id}, into.Id); err == nil {
		t.Fatal("moved a track over another track's file")
	}

	got, _ := f.app.FindRecordById("tracks", track.Id)
	if got.GetString("album") != from.Id || !f.file("From", "Song") {
		t.Fatal("a refused move still changed the track or its file")
	}
}

func TestAChosenTypeSurvivesRegrouping(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("From"), f.album("Into")
	track := f.track(from, "Song", nil)
	f.track(into, "Other", nil)
	if err := SetAlbumType(f.app, into.Id, "album"); err != nil {
		t.Fatal(err)
	}

	if err := MoveTracks(f.app, []string{track.Id}, into.Id); err != nil {
		t.Fatal(err)
	}
	got, _ := f.app.FindRecordById("albums", into.Id)
	if got.GetString("type") != "album" {
		t.Fatalf("type = %q, want the chosen album", got.GetString("type"))
	}

	if err := SetAlbumType(f.app, into.Id, ""); err != nil {
		t.Fatal(err)
	}
	got, _ = f.app.FindRecordById("albums", into.Id)
	if got.GetString("type") != "single" || got.GetBool("typeLocked") {
		t.Fatalf("handed back, type = %q locked = %v; want single, unlocked", got.GetString("type"), got.GetBool("typeLocked"))
	}
}

func TestMergingKeepsTheLikesOfTheMergedAlbum(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("From"), f.album("Into")
	f.track(from, "A", nil)
	f.track(into, "B", nil)
	c, _ := f.app.FindCollectionByNameOrId("album_ratings")
	rating := core.NewRecord(c)
	rating.Set("user", "u1")
	rating.Set("album", from.Id)
	rating.Set("value", "like")
	f.save(rating)

	if err := MergeAlbums(f.app, from.Id, into.Id); err != nil {
		t.Fatal(err)
	}

	if len(f.albumsNamed("From")) != 0 {
		t.Fatal("the merged album is still there")
	}
	liked, err := f.app.FindRecordsByFilter("album_ratings", "album = {:a} && user = 'u1'", "", 0, 0, dbx.Params{"a": into.Id})
	if err != nil || len(liked) != 1 {
		t.Fatalf("likes on the destination = %d (%v), want 1", len(liked), err)
	}
	if err := MergeAlbums(f.app, into.Id, into.Id); err == nil {
		t.Fatal("merged an album into itself")
	}
}

func TestRejectedMergeDoesNotCarryRatings(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("From"), f.album("Into")
	track := f.track(from, "Song", nil)
	f.track(into, "Song", nil)
	c, _ := f.app.FindCollectionByNameOrId("album_ratings")
	rating := core.NewRecord(c)
	rating.Set("user", "u1")
	rating.Set("album", from.Id)
	rating.Set("value", "like")
	f.save(rating)

	if err := MergeAlbums(f.app, from.Id, into.Id); err == nil {
		t.Fatal("merge overwrote an existing file")
	}
	got, err := f.app.FindRecordById("tracks", track.Id)
	if err != nil || got.GetString("album") != from.Id {
		t.Fatalf("source track changed: %v", err)
	}
	source, _ := f.app.FindRecordsByFilter("album_ratings", "album = {:a}", "", 0, 0, dbx.Params{"a": from.Id})
	dest, _ := f.app.FindRecordsByFilter("album_ratings", "album = {:a}", "", 0, 0, dbx.Params{"a": into.Id})
	if len(source) != 1 || len(dest) != 0 {
		t.Fatalf("ratings after failed merge: source %d, destination %d", len(source), len(dest))
	}
}

func TestMergingEmptyAlbumCarriesRatingsAndRemovesSource(t *testing.T) {
	f := newRegroupFixture(t)
	from, into := f.album("Empty"), f.album("Into")
	c, _ := f.app.FindCollectionByNameOrId("album_ratings")
	rating := core.NewRecord(c)
	rating.Set("user", "u1")
	rating.Set("album", from.Id)
	rating.Set("value", "like")
	f.save(rating)

	if err := MergeAlbums(f.app, from.Id, into.Id); err != nil {
		t.Fatal(err)
	}
	if len(f.albumsNamed("Empty")) != 0 {
		t.Fatal("empty source survived merge")
	}
	dest, err := f.app.FindRecordsByFilter("album_ratings", "album = {:a} && user = 'u1'", "", 0, 0, dbx.Params{"a": into.Id})
	if err != nil || len(dest) != 1 || dest[0].GetString("value") != "like" {
		t.Fatalf("destination ratings = %v, %v", dest, err)
	}
}

func TestNewAlbumRejectsExistingEmptyAlbum(t *testing.T) {
	f := newRegroupFixture(t)
	existing, from := f.album("Existing"), f.album("From")
	track := f.track(from, "Song", nil)
	if _, err := NewAlbumFromTracks(context.Background(), f.app, []string{track.Id}, "Existing"); err == nil {
		t.Fatal("accepted an existing album")
	}
	if _, err := f.app.FindRecordById("albums", existing.Id); err != nil {
		t.Fatalf("existing album deleted: %v", err)
	}
	got, err := f.app.FindRecordById("tracks", track.Id)
	if err != nil || got.GetString("album") != from.Id || !f.file("From", "Song") {
		t.Fatalf("track changed after rejected split: %v", err)
	}
}

func TestResetIncompleteAlbumPreservesUnknownType(t *testing.T) {
	f := newRegroupFixture(t)
	album := f.album("Catalog")
	album.Set("typeIncomplete", true)
	f.save(album)
	f.track(album, "Song", nil)
	if err := SetAlbumType(f.app, album.Id, "album"); err != nil {
		t.Fatal(err)
	}
	if err := SetAlbumType(f.app, album.Id, ""); err != nil {
		t.Fatal(err)
	}
	got, err := f.app.FindRecordById("albums", album.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got.GetString("type") != "" || got.GetBool("typeLocked") {
		t.Fatalf("reset incomplete album: type %q, locked %v", got.GetString("type"), got.GetBool("typeLocked"))
	}
}

func TestSplittingLegacyYouTubeAlbumsGivesEachTrackItsOwnAlbum(t *testing.T) {
	f := newRegroupFixture(t)
	legacy := f.album("Channel - youtube")
	f.track(legacy, "First", nil)
	f.track(legacy, "Second", map[string]any{"year": 2020})
	chaptered := f.album("Big Video - youtube")
	f.track(chaptered, "Part", map[string]any{"startTime": 0.0, "endTime": 60.0})
	named := f.album("Renamed")
	f.track(named, "Kept", nil)

	for range 2 {
		if err := SplitLegacyYouTubeAlbums(context.Background(), f.app); err != nil {
			t.Fatal(err)
		}
	}

	if len(f.albumsNamed("Channel - youtube")) != 0 {
		t.Fatal("the fallback album survived")
	}
	for _, title := range []string{"First", "Second"} {
		albums := f.albumsNamed(title)
		if len(albums) != 1 || albums[0].GetString("type") != "single" {
			t.Fatalf("album %q: %d found, type %q", title, len(albums), albums[0].GetString("type"))
		}
		if _, err := os.Stat(filepath.Join(f.root, "Channel", AlbumDirectoryName(albums[0]), "01 - "+title+".m4a")); err != nil || f.file("Channel - youtube", title) {
			t.Fatalf("the file of %q did not move", title)
		}
	}
	if got := f.albumsNamed("Second")[0].GetInt("year"); got != 2020 {
		t.Fatalf("year = %d, want 2020", got)
	}
	if len(f.albumsNamed("Big Video - youtube")) != 1 || len(f.albumsNamed("Renamed")) != 1 {
		t.Fatal("an album that is not a loose single was split")
	}
}

func TestBackfillOnlyNamesAlbumsWhoseContentIsKnown(t *testing.T) {
	f := newRegroupFixture(t)
	partial := f.album("Seen through one track")
	f.track(partial, "Only", nil)
	cut := f.album("Cut video - youtube")
	for _, title := range []string{"a", "b", "c", "d", "e", "f", "g"} {
		f.track(cut, title, map[string]any{"startTime": 0.0, "endTime": 60.0})
	}

	if err := BackfillAlbumTypes(f.app); err != nil {
		t.Fatal(err)
	}

	got, _ := f.app.FindRecordById("albums", partial.Id)
	if got.GetString("type") != "" {
		t.Fatalf("a partial album was called %q", got.GetString("type"))
	}
	got, _ = f.app.FindRecordById("albums", cut.Id)
	if got.GetString("type") != "album" {
		t.Fatalf("a seven-track cut video = %q, want album", got.GetString("type"))
	}
}
