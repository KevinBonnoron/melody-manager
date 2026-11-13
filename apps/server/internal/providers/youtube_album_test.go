package providers

import (
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ytdlp"
)

func TestYouTubeAlbumCompleteness(t *testing.T) {
	chapters := []ytdlp.Chapter{{Title: "First", StartTime: 0, EndTime: 120}, {Title: "Second", StartTime: 120, EndTime: 240}}
	for _, tc := range []struct {
		name            string
		info            ytdlp.TrackInfo
		wantType        string
		incomplete, own bool
	}{
		{"source album with chapters", ytdlp.TrackInfo{Title: "Video", Album: "Release", Chapters: chapters}, "", true, false},
		{"video with chapters", ytdlp.TrackInfo{Title: "Video", Chapters: chapters}, domain.AlbumSingle, false, true},
		{"standalone video", ytdlp.TrackInfo{Title: "Video"}, domain.AlbumSingle, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := ytdlp.BuildResolvedTrack(tc.info, "youtube")
			base.Duration = 240
			tracks := resolvedYouTubeTracks(tc.info, base)
			for _, track := range tracks {
				if track.AlbumType != tc.wantType || track.AlbumIncomplete != tc.incomplete || track.AlbumOwn != tc.own {
					t.Fatalf("got type %q incomplete %v own %v", track.AlbumType, track.AlbumIncomplete, track.AlbumOwn)
				}
			}
		})
	}
}
