package services

import (
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
