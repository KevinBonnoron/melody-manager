package migrations

import (
	"reflect"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func TestLocalTrackOriginMigrationDeduplicatesAndConstrainsOnlyLocalTracks(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	defer app.ResetBootstrapState()

	collection := core.NewBaseCollection("tracks")
	collection.Fields.Add(
		&core.TextField{Name: "title"},
		&core.TextField{Name: "source"},
		&core.TextField{Name: "origin"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	playbackStates := core.NewBaseCollection("playback_state")
	playbackStates.Fields.Add(
		&core.RelationField{
			Name: "track", Required: true, MaxSelect: 1, CollectionId: collection.Id, CascadeDelete: true,
		},
		&core.JSONField{Name: "list", MaxSize: 1 << 20},
	)
	if err := app.Save(playbackStates); err != nil {
		t.Fatal(err)
	}
	trackRatings := core.NewBaseCollection("track_ratings")
	trackRatings.Fields.Add(
		&core.TextField{Name: "user", Required: true},
		&core.RelationField{Name: "track", Required: true, MaxSelect: 1, CollectionId: collection.Id, CascadeDelete: true},
	)
	if err := app.Save(trackRatings); err != nil {
		t.Fatal(err)
	}
	shareLinks := core.NewBaseCollection("share_links")
	shareLinks.Fields.Add(&core.RelationField{
		Name: "track", Required: true, MaxSelect: 1, CollectionId: collection.Id, CascadeDelete: true,
	})
	if err := app.Save(shareLinks); err != nil {
		t.Fatal(err)
	}
	trackPlays := core.NewBaseCollection("track_plays")
	trackPlays.Fields.Add(&core.RelationField{
		Name: "track", Required: true, MaxSelect: 1, CollectionId: collection.Id, CascadeDelete: true,
	})
	if err := app.Save(trackPlays); err != nil {
		t.Fatal(err)
	}
	playlists := core.NewBaseCollection("playlists")
	playlists.Fields.Add(&core.RelationField{
		Name: "tracks", MaxSelect: 9999, CollectionId: collection.Id,
	})
	if err := app.Save(playlists); err != nil {
		t.Fatal(err)
	}

	create := func(source, origin string) *core.Record {
		t.Helper()
		record := core.NewRecord(collection)
		record.Set("title", "Song")
		record.Set("source", source)
		record.Set("origin", origin)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}

	origin := "file:///music/song.flac"
	keeper := create("local", origin)
	duplicate := create("local", origin)
	create("youtube", origin)
	for id, created := range map[string]string{
		keeper.Id:    "2020-01-01 00:00:00.000Z",
		duplicate.Id: "2021-01-01 00:00:00.000Z",
	} {
		if _, err := app.DB().NewQuery("UPDATE tracks SET created = {:created} WHERE id = {:id}").
			Bind(dbx.Params{"created": created, "id": id}).Execute(); err != nil {
			t.Fatal(err)
		}
	}

	playbackState := core.NewRecord(playbackStates)
	playbackState.Set("track", duplicate.Id)
	playbackState.Set("list", []string{duplicate.Id, keeper.Id, duplicate.Id})
	if err := app.Save(playbackState); err != nil {
		t.Fatal(err)
	}
	emptyQueue := core.NewRecord(playbackStates)
	emptyQueue.Set("track", duplicate.Id)
	if err := app.Save(emptyQueue); err != nil {
		t.Fatal(err)
	}
	rating := core.NewRecord(trackRatings)
	rating.Set("user", "listener")
	rating.Set("track", duplicate.Id)
	if err := app.Save(rating); err != nil {
		t.Fatal(err)
	}
	shareLink := core.NewRecord(shareLinks)
	shareLink.Set("track", duplicate.Id)
	if err := app.Save(shareLink); err != nil {
		t.Fatal(err)
	}
	play := core.NewRecord(trackPlays)
	play.Set("track", duplicate.Id)
	if err := app.Save(play); err != nil {
		t.Fatal(err)
	}
	playlist := core.NewRecord(playlists)
	playlist.Set("tracks", []string{duplicate.Id, keeper.Id, duplicate.Id})
	if err := app.Save(playlist); err != nil {
		t.Fatal(err)
	}

	if err := migrateLocalTrackOrigins(app); err != nil {
		t.Fatal(err)
	}

	playbackState, err := app.FindRecordById("playback_state", playbackState.Id)
	if err != nil {
		t.Fatalf("playback state pointing at a duplicate was deleted: %v", err)
	}
	if got := playbackState.GetString("track"); got != keeper.Id {
		t.Fatalf("playback state points at %q, want retained track %q", got, keeper.Id)
	}
	var list []string
	if err := playbackState.UnmarshalJSONField("list", &list); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(list, []string{keeper.Id, keeper.Id, keeper.Id}) {
		t.Fatalf("playback queue = %v, want every duplicate replaced by %q", list, keeper.Id)
	}
	rating, err = app.FindRecordById("track_ratings", rating.Id)
	if err != nil {
		t.Fatalf("rating pointing at a duplicate was deleted: %v", err)
	}
	if got := rating.GetString("track"); got != keeper.Id {
		t.Fatalf("rating points at %q, want retained track %q", got, keeper.Id)
	}
	shareLink, err = app.FindRecordById("share_links", shareLink.Id)
	if err != nil {
		t.Fatalf("share link pointing at a duplicate was deleted: %v", err)
	}
	if got := shareLink.GetString("track"); got != keeper.Id {
		t.Fatalf("share link points at %q, want retained track %q", got, keeper.Id)
	}
	play, err = app.FindRecordById("track_plays", play.Id)
	if err != nil {
		t.Fatalf("play history pointing at a duplicate was deleted: %v", err)
	}
	if got := play.GetString("track"); got != keeper.Id {
		t.Fatalf("play history points at %q, want retained track %q", got, keeper.Id)
	}
	playlist, err = app.FindRecordById("playlists", playlist.Id)
	if err != nil {
		t.Fatal(err)
	}
	playlistTracks := playlist.GetStringSlice("tracks")
	if !reflect.DeepEqual(playlistTracks, []string{keeper.Id}) {
		t.Fatalf("playlist tracks = %v, want only retained track %q", playlistTracks, keeper.Id)
	}

	local, err := app.FindRecordsByFilter("tracks", "source = 'local' && origin = {:origin}", "", 0, 0, dbx.Params{"origin": origin})
	if err != nil {
		t.Fatal(err)
	}
	if len(local) != 1 || local[0].Id != keeper.Id {
		t.Fatalf("migration kept %+v, want only oldest record %q", local, keeper.Id)
	}

	record := core.NewRecord(collection)
	record.Set("source", "local")
	record.Set("origin", origin)
	if err := app.Save(record); err == nil {
		t.Fatal("a second local track with the same origin was accepted")
	}

	if _, err := app.DB().NewQuery("UPDATE playback_state SET list = '' WHERE id = {:id}").
		Bind(dbx.Params{"id": playbackState.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.DB().NewQuery("DROP INDEX IF EXISTS " + localTrackOriginIndex).Execute(); err != nil {
		t.Fatal(err)
	}
	if err := migrateLocalTrackOrigins(app); err != nil {
		t.Fatalf("migration without duplicates must ignore an empty saved queue: %v", err)
	}

	create("youtube", origin)
}
