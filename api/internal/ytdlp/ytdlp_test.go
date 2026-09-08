package ytdlp

import "testing"

// Ported from the deleted server/src/utils/yt-dlp.util.test.ts: this parser
// splits an album upload into tracks, so a regression here silently produces
// one giant track instead of a tracklist.
func TestParseChapters(t *testing.T) {
	type want struct {
		title string
		start float64
		end   float64
	}
	cases := []struct {
		name     string
		text     string
		duration float64
		want     []want
	}{
		{
			name:     "timestamp - title",
			text:     "0:00 - Introduction\n3:45 - First Movement\n7:30 - Second Movement",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 450}, {"Second Movement", 450, 600}},
		},
		{
			name:     "timestamp title without separator",
			text:     "0:00 Introduction\n3:45 First Movement",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "bracketed timestamp",
			text:     "[0:00] Introduction\n[3:45] First Movement",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "en dash separator",
			text:     "0:00 – Introduction\n3:45 – First Movement",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "strips leading track numbers",
			text:     "0:00 01 Introduction\n3:45 02 First Movement",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "H:MM:SS timestamps",
			text:     "0:00 Introduction\n1:03:33 Boss Battle\n2:05:23 Credits",
			duration: 8000,
			want:     []want{{"Introduction", 0, 3813}, {"Boss Battle", 3813, 7523}, {"Credits", 7523, 8000}},
		},
		{
			name:     "title then timestamp",
			text:     "Introduction: 0:00\nFirst Movement: 3:45",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "numbered title then timestamp",
			text:     "01. Introduction: 0:00\n02. First Movement: 3:45",
			duration: 600,
			want:     []want{{"Introduction", 0, 225}, {"First Movement", 225, 600}},
		},
		{
			name:     "trailing timestamp",
			text:     "01. Main Menu 0:00\n02. Main Menu (Lullaby Ver.) 1:05\n03. Tutorial & Kakariko Crypt (Peaceful) 2:11",
			duration: 300,
			want: []want{
				{"Main Menu", 0, 65},
				{"Main Menu (Lullaby Ver.)", 65, 131},
				{"Tutorial & Kakariko Crypt (Peaceful)", 131, 300},
			},
		},
		{
			// Regression from main's 2216e8e.
			name:     "dash-separated track numbers",
			text:     "1-01 Main Theme 0:00\n1-02 Opening [Episode One]  01:10\n1-03 The Book [First Episode]  01:52",
			duration: 800,
			want: []want{
				{"Main Theme", 0, 70},
				{"Opening [Episode One]", 70, 112},
				{"The Book [First Episode]", 112, 800},
			},
		},
		{
			name:     "trailing H:MM:SS timestamps",
			text:     "28. Temple of Storms (Combat) [Glockenspiel Ver.] 1:01:08\n29. Gleeokenspiel Boss Battle 1:03:33",
			duration: 4000,
			want: []want{
				{"Temple of Storms (Combat) [Glockenspiel Ver.]", 3668, 3813},
				{"Gleeokenspiel Boss Battle", 3813, 4000},
			},
		},
		{
			name:     "no space before trailing timestamp",
			text:     "29. Gleeokenspiel Boss Battle1:03:33\n30. Game Over 1:06:15",
			duration: 4000,
			want:     []want{{"Gleeokenspiel Boss Battle", 3813, 3975}, {"Game Over", 3975, 4000}},
		},
		{
			name:     "no timestamps yields nothing",
			text:     "just a description with no tracklist at all",
			duration: 600,
			want:     nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseChapters(tc.text, tc.duration)
			if len(got) != len(tc.want) {
				t.Fatalf("got %d chapters, want %d: %+v", len(got), len(tc.want), got)
			}
			for i, w := range tc.want {
				if got[i].Title != w.title {
					t.Errorf("chapter %d title = %q, want %q", i, got[i].Title, w.title)
				}
				if got[i].StartTime != w.start {
					t.Errorf("chapter %d start = %v, want %v", i, got[i].StartTime, w.start)
				}
				if got[i].EndTime != w.end {
					t.Errorf("chapter %d end = %v, want %v", i, got[i].EndTime, w.end)
				}
			}
		})
	}
}

// yt-dlp reads any argv entry starting with "-" as an option, so a URL that is
// not really a URL must never reach the command line.
func TestValidateURL(t *testing.T) {
	valid := []string{
		"https://www.youtube.com/watch?v=abc",
		"http://soundcloud.com/artist/track",
		"https://artist.bandcamp.com/album/x",
	}
	for _, u := range valid {
		if err := validateURL(u); err != nil {
			t.Errorf("validateURL(%q) = %v, want nil", u, err)
		}
	}

	invalid := []string{
		"--config-location=/tmp/x#youtube.com",
		"-o/tmp/pwned",
		"file:///etc/shadow",
		"ytsearch20:something",
		"https://",
		"",
	}
	for _, u := range invalid {
		if err := validateURL(u); err == nil {
			t.Errorf("validateURL(%q) = nil, want an error", u)
		}
	}
}

func TestSearchSpecShape(t *testing.T) {
	valid := []string{"ytsearch20:jazz", "scsearch:lofi", "ytsearch5:a b c"}
	for _, spec := range valid {
		if !searchSpecRe.MatchString(spec) {
			t.Errorf("searchSpecRe rejected %q", spec)
		}
	}
	invalid := []string{"--flat-playlist", "https://youtube.com/x", "search:foo", " ytsearch:x"}
	for _, spec := range invalid {
		if searchSpecRe.MatchString(spec) {
			t.Errorf("searchSpecRe accepted %q", spec)
		}
	}
}
