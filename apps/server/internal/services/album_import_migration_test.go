package services

import (
	"context"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/pocketbase/pocketbase/core"
)

func TestStandaloneVideosWithSameTitleKeepDistinctAlbums(t *testing.T) {
	f := newRegroupFixture(t)
	ctx := context.Background()
	base := domain.ResolvedTrack{Title: "Same", AlbumName: "Same", ArtistName: "Channel", Source: "youtube", Duration: 200, AlbumType: domain.AlbumSingle, AlbumOwn: true}
	base.Origin = "https://youtube.com/watch?v=first"
	first, err := persistTrack(ctx, f.app, base)
	if err != nil {
		t.Fatal(err)
	}
	base.Origin = "https://youtube.com/watch?v=second"
	second, err := persistTrack(ctx, f.app, base)
	if err != nil {
		t.Fatal(err)
	}
	if first.GetString("album") == second.GetString("album") {
		t.Fatal("different videos share an album")
	}
	repeat, err := persistTrack(ctx, f.app, base)
	if err != nil || repeat.Id != second.Id {
		t.Fatalf("reimport = %v, %v", repeat, err)
	}
	catalog := base
	catalog.Origin = "https://youtube.com/watch?v=catalog"
	catalog.AlbumOwn = false
	catalog.AlbumType = ""
	catalog.AlbumIncomplete = true
	third, err := persistTrack(ctx, f.app, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if third.GetString("album") == first.GetString("album") || third.GetString("album") == second.GetString("album") {
		t.Fatal("catalog album reused a video album")
	}
	album, err := f.app.FindRecordById("albums", third.GetString("album"))
	if err != nil || !album.GetBool("typeIncomplete") || album.GetString("type") != "" {
		t.Fatalf("catalog album = %v, %v", album, err)
	}
}

func TestLegacySplitSameTitleAndBackfillProvenance(t *testing.T) {
	f := newRegroupFixture(t)
	old := f.album("Channel - youtube")
	col, _ := f.app.FindCollectionByNameOrId("tracks")
	for _, origin := range []string{"youtube:first", "youtube:second"} {
		track := core.NewRecord(col)
		track.Set("title", "Same")
		track.Set("origin", origin)
		track.Set("source", "youtube")
		track.Set("duration", 100)
		track.Set("artists", []string{f.artist.Id})
		track.Set("album", old.Id)
		f.save(track)
	}
	partial := f.album("Source album")
	track := core.NewRecord(col)
	track.Set("title", "Chapter")
	track.Set("origin", "youtube:chapter")
	track.Set("source", "youtube")
	track.Set("duration", 100)
	track.Set("artists", []string{f.artist.Id})
	track.Set("album", partial.Id)
	track.Set("metadata", map[string]any{"startTime": 0})
	f.save(track)
	if err := SplitLegacyYouTubeAlbums(context.Background(), f.app); err != nil {
		t.Fatal(err)
	}
	if err := BackfillAlbumTypes(f.app); err != nil {
		t.Fatal(err)
	}
	albums := f.albumsNamed("Same")
	if len(albums) != 2 {
		t.Fatalf("got %d same-title albums", len(albums))
	}
	for _, album := range albums {
		if album.GetString("type") != domain.AlbumSingle || album.GetBool("typeIncomplete") {
			t.Fatalf("split album: %v", album)
		}
	}
	partial, err := f.app.FindRecordById("albums", partial.Id)
	if err != nil || !partial.GetBool("typeIncomplete") || partial.GetString("type") != "" {
		t.Fatalf("partial album: %v, %v", partial, err)
	}
}

func TestAlbumMigrationMarkerRunsOnlyOnce(t *testing.T) {
	f := newRegroupFixture(t)
	if _, err := f.app.DB().NewQuery("CREATE TABLE _album_type_backfill (pending INTEGER NOT NULL)").Execute(); err != nil {
		t.Fatal(err)
	}
	if _, err := f.app.DB().NewQuery("INSERT INTO _album_type_backfill VALUES (1)").Execute(); err != nil {
		t.Fatal(err)
	}
	if err := CompleteAlbumTypeMigration(context.Background(), f.app); err != nil {
		t.Fatal(err)
	}
	legacy := f.album("Channel - youtube")
	col, _ := f.app.FindCollectionByNameOrId("tracks")
	track := core.NewRecord(col)
	track.Set("title", "New")
	track.Set("origin", "youtube:new")
	track.Set("source", "youtube")
	track.Set("album", legacy.Id)
	track.Set("artists", []string{f.artist.Id})
	f.save(track)
	if err := CompleteAlbumTypeMigration(context.Background(), f.app); err != nil {
		t.Fatal(err)
	}
	track, err := f.app.FindRecordById("tracks", track.Id)
	if err != nil || track.GetString("album") != legacy.Id {
		t.Fatalf("completed migration reran: %v, %v", track, err)
	}
}

func TestChapteredVideosWithSameTitleKeepDistinctAlbumsOnReimport(t *testing.T) {
	f := newRegroupFixture(t)
	ctx := t.Context()
	var firstAlbum string
	trackIDs := make(map[string]bool)
	for _, origin := range []string{"https://youtube.com/watch?v=first", "https://youtube.com/watch?v=second"} {
		var albumID string
		for index, title := range []string{"Opening", "Opening", "Finale"} {
			start, end := float64(index*120), float64((index+1)*120)
			resolved := domain.ResolvedTrack{
				Title: title, AlbumName: "Same OST", ArtistName: "Channel",
				Source: "youtube", Origin: origin, Duration: 120,
				AlbumType: domain.AlbumSingle, AlbumOwn: true,
				Metadata: domain.TrackMetadata{StartTime: &start, EndTime: &end},
			}
			track, err := persistTrack(ctx, f.app, resolved)
			if err != nil {
				t.Fatal(err)
			}
			if trackIDs[track.Id] {
				t.Fatalf("different chapters reused track %s", track.Id)
			}
			trackIDs[track.Id] = true
			if albumID != "" && track.GetString("album") != albumID {
				t.Fatal("chapters from one video landed in different albums")
			}
			albumID = track.GetString("album")
			repeated, err := persistTrack(ctx, f.app, resolved)
			if err != nil || repeated.Id != track.Id {
				t.Fatalf("reimport duplicated chapter %q: %v", title, err)
			}
		}
		if firstAlbum == "" {
			firstAlbum = albumID
		} else if albumID == firstAlbum {
			t.Fatal("same-title chaptered videos share an album")
		}
	}
	albums := f.albumsNamed("Same OST")
	if len(albums) != 2 {
		t.Fatalf("same-title releases = %d, want 2", len(albums))
	}
	tracks, err := f.app.FindAllRecords("tracks")
	if err != nil || len(tracks) != 6 {
		t.Fatalf("tracks after reimport = %d, want six distinct chapters: %v", len(tracks), err)
	}
}
