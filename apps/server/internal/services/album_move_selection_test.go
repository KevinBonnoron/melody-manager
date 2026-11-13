package services

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMoveRefusesAmbiguousDownloadedAudio(t *testing.T) {
	for _, twoFiles := range []bool{false, true} {
		name := "one file shared by same-title tracks"
		if twoFiles {
			name = "two numbered files with the same title"
		}
		t.Run(name, func(t *testing.T) {
			f := newRegroupFixture(t)
			source, target := f.album("Source"), f.album("Target")
			first := f.track(source, "Song", nil)
			second := f.track(source, "Song", nil)
			second.Set("origin", "https://youtu.be/second-song")
			f.save(second)
			firstPath := filepath.Join(f.root, "Channel", "Source", "01 - Song.m4a")
			if err := os.WriteFile(firstPath, []byte("first recording"), 0o644); err != nil {
				t.Fatal(err)
			}
			secondPath := filepath.Join(f.root, "Channel", "Source", "02 - Song.m4a")
			if twoFiles {
				if err := os.WriteFile(secondPath, []byte("second recording"), 0o644); err != nil {
					t.Fatal(err)
				}
			}

			if err := MoveTracks(f.app, []string{second.Id}, target.Id); err == nil || !strings.Contains(err.Error(), "ambiguous") {
				t.Fatalf("expected an ambiguity error, got %v", err)
			}
			for _, id := range []string{first.Id, second.Id} {
				track, err := f.app.FindRecordById("tracks", id)
				if err != nil || track.GetString("album") != source.Id {
					t.Fatalf("refused move changed track %s: %v", id, err)
				}
			}
			if data, err := os.ReadFile(firstPath); err != nil || string(data) != "first recording" {
				t.Fatalf("first audio changed: %q, %v", data, err)
			}
			if twoFiles {
				if data, err := os.ReadFile(secondPath); err != nil || string(data) != "second recording" {
					t.Fatalf("second audio changed: %q, %v", data, err)
				}
			}
			if _, err := os.Stat(filepath.Join(f.root, "Channel", "Target", "01 - Song.m4a")); !os.IsNotExist(err) {
				t.Fatalf("refused move created destination: %v", err)
			}
		})
	}
}

func TestMoveSelectsCompleteDownloadedTitle(t *testing.T) {
	for _, ownFile := range []bool{false, true} {
		name := "only another track's suffix-matching file exists"
		if ownFile {
			name = "exact and suffix-matching files both exist"
		}
		t.Run(name, func(t *testing.T) {
			f := newRegroupFixture(t)
			source, target := f.album("Source"), f.album("Target")
			theme := f.track(source, "Theme", nil)
			opening := f.track(source, "Opening - Theme", nil)
			sourceDir := filepath.Join(f.root, "Channel", "Source")
			themePath := filepath.Join(sourceDir, "01 - Theme.m4a")
			openingPath := filepath.Join(sourceDir, "01 - Opening - Theme.m4a")
			if !ownFile {
				if err := os.Remove(themePath); err != nil {
					t.Fatal(err)
				}
			}
			wantLocal := ""
			if ownFile {
				wantLocal = themePath
			}
			if got := localFile(f.app, theme, []string{f.root}); got != wantLocal {
				t.Fatalf("playback selected %q, want %q", got, wantLocal)
			}

			err := MoveTracks(f.app, []string{theme.Id}, target.Id)
			wantAlbum := source.Id
			destination := filepath.Join(f.root, "Channel", "Target", "01 - Theme.m4a")
			if ownFile {
				if err != nil {
					t.Fatalf("valid exact-title move failed: %v", err)
				}
				wantAlbum = target.Id
				if data, err := os.ReadFile(destination); err != nil || string(data) != "Theme" {
					t.Fatalf("wrong audio moved: %q, %v", data, err)
				}
				if _, err := os.Stat(themePath); !os.IsNotExist(err) {
					t.Fatalf("moved audio remained at source: %v", err)
				}
			} else {
				if !errors.Is(err, errAmbiguousDownloadedFile) {
					t.Fatalf("expected refusal of a suffix-only match, got %v", err)
				}
				if _, err := os.Stat(destination); !os.IsNotExist(err) {
					t.Fatalf("refused move created destination: %v", err)
				}
			}
			for id, album := range map[string]string{theme.Id: wantAlbum, opening.Id: source.Id} {
				record, err := f.app.FindRecordById("tracks", id)
				if err != nil || record.GetString("album") != album {
					t.Fatalf("track %s has incorrect album after move: %v", id, err)
				}
			}
			if data, err := os.ReadFile(openingPath); err != nil || string(data) != "Opening - Theme" {
				t.Fatalf("another track's audio changed: %q, %v", data, err)
			}
		})
	}
}
