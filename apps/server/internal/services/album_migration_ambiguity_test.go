package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestAlbumMigrationSkipsAmbiguousGroupsAndCompletesOtherAlbums(t *testing.T) {
	for _, tc := range []struct {
		name       string
		tracks     int
		secondFile bool
		suffixOnly bool
	}{
		{"two tracks share one file", 2, false, false},
		{"two same-title tracks and numbered files", 2, true, false},
		{"one track with two candidate files", 1, true, false},
		{"only another track's suffix-matching file exists", 2, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newRegroupFixture(t)
			legacy := f.album("Channel - youtube")
			// Put an unambiguous track first: preflight must leave the entire
			// group in place, not split some of it before finding the conflict.
			unique := f.track(legacy, "Unique", nil)
			ids := []string{unique.Id}
			for index := range tc.tracks {
				title := "Song"
				if tc.suffixOnly && index == 0 {
					title = "Opening - Song"
				}
				track := f.track(legacy, title, nil)
				track.Set("origin", "https://youtu.be/"+track.Id)
				f.save(track)
				ids = append(ids, track.Id)
			}
			firstPath := filepath.Join(f.root, "Channel", "Channel - youtube", "01 - Song.m4a")
			if tc.suffixOnly {
				if err := os.Remove(firstPath); err != nil {
					t.Fatal(err)
				}
				firstPath = filepath.Join(filepath.Dir(firstPath), "01 - Opening - Song.m4a")
			}
			if err := os.WriteFile(firstPath, []byte("original recording"), 0o644); err != nil {
				t.Fatal(err)
			}
			secondPath := filepath.Join(filepath.Dir(firstPath), "02 - Song.m4a")
			if tc.secondFile {
				if err := os.WriteFile(secondPath, []byte("other recording"), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			ratings, err := f.app.FindCollectionByNameOrId("album_ratings")
			if err != nil {
				t.Fatal(err)
			}
			rating := core.NewRecord(ratings)
			rating.Set("user", "listener")
			rating.Set("album", legacy.Id)
			rating.Set("value", "like")
			f.save(rating)
			clear := f.album("Other channel - youtube")
			clearTrack := f.track(clear, "Clear song", nil)
			if _, err := f.app.DB().NewQuery("CREATE TABLE _album_type_backfill (pending INTEGER NOT NULL)").Execute(); err != nil {
				t.Fatal(err)
			}
			if _, err := f.app.DB().NewQuery("INSERT INTO _album_type_backfill VALUES (1)").Execute(); err != nil {
				t.Fatal(err)
			}

			if err := CompleteAlbumTypeMigration(t.Context(), f.app); err != nil {
				t.Fatalf("ambiguous files blocked migration: %v", err)
			}
			for _, id := range ids {
				track, err := f.app.FindRecordById("tracks", id)
				if err != nil || track.GetString("album") != legacy.Id {
					t.Fatalf("ambiguous group track %s was reassigned: %v", id, err)
				}
			}
			if len(f.albumsNamed("Unique")) != 0 || len(f.albumsNamed("Song")) != 0 {
				t.Fatal("skipping the group left split or empty albums behind")
			}
			preserved, err := f.app.FindRecordById("album_ratings", rating.Id)
			if err != nil || preserved.GetString("album") != legacy.Id {
				t.Fatalf("skipping the group changed its rating: %v", err)
			}
			if data, err := os.ReadFile(firstPath); err != nil || string(data) != "original recording" {
				t.Fatalf("ambiguous original audio changed: %q, %v", data, err)
			}
			if tc.secondFile {
				if data, err := os.ReadFile(secondPath); err != nil || string(data) != "other recording" {
					t.Fatalf("ambiguous alternate audio changed: %q, %v", data, err)
				}
			}
			moved, err := f.app.FindRecordById("tracks", clearTrack.Id)
			if err != nil || moved.GetString("album") == clear.Id {
				t.Fatalf("unambiguous album was not migrated: %v", err)
			}
			var pending int
			if err := f.app.DB().NewQuery("SELECT COUNT(*) FROM _album_type_backfill").Row(&pending); err != nil || pending != 0 {
				t.Fatalf("one-shot migration was not completed: pending=%d, error=%v", pending, err)
			}
		})
	}
}
