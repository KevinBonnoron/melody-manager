package ytdlp

import (
	"errors"
	"strings"
	"testing"
)

// Ported from the deleted server/src/utils/yt-dlp.util.test.ts.
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

// yt-dlp reads any argv entry starting with "-" as an option, so a URL that is not really a URL
// must never reach the command line.
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

func TestNeedsChapterRecovery(t *testing.T) {
	even := []Chapter{
		{Title: "One", StartTime: 0, EndTime: 100},
		{Title: "Two", StartTime: 100, EndTime: 200},
		{Title: "Three", StartTime: 200, EndTime: 320},
	}
	truncated := []Chapter{
		{Title: "One", StartTime: 0, EndTime: 100},
		{Title: "Two", StartTime: 100, EndTime: 200},
		{Title: "Check Comments :)", StartTime: 200, EndTime: 12000},
	}
	numbered := []Chapter{
		{Title: "1.", StartTime: 0, EndTime: 100},
		{Title: "2.", StartTime: 100, EndTime: 200},
	}

	cases := []struct {
		name string
		info TrackInfo
		want bool
	}{
		{"chapters of a comparable length are kept", TrackInfo{Chapters: even}, false},
		{"a last chapter running far longer means the list stops early", TrackInfo{Chapters: truncated}, true},
		{"titles that are only numbers name nothing", TrackInfo{Chapters: numbered}, true},
		{"a single chapter is no chapter list", TrackInfo{Chapters: even[:1]}, true},
		{"no chapters at all", TrackInfo{}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := needsChapterRecovery(tc.info); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPickChapters(t *testing.T) {
	short := []Chapter{{Title: "One", EndTime: 100}, {Title: "Two", EndTime: 200}}
	long := []Chapter{{Title: "One", EndTime: 100}, {Title: "Two", EndTime: 200}, {Title: "Three", EndTime: 300}}
	sameCountFurther := []Chapter{{Title: "One", EndTime: 150}, {Title: "Two", EndTime: 900}}

	if got := pickChapters(nil, long, 300); len(got) != 3 {
		t.Fatalf("with no description chapters the comments win, got %d", len(got))
	}
	if got := pickChapters(long, nil, 300); len(got) != 3 {
		t.Fatalf("with no comment chapters the description wins, got %d", len(got))
	}
	if got := pickChapters(short, long, 300); len(got) != 3 {
		t.Fatalf("the longer list wins, got %d", len(got))
	}
	if got := pickChapters(long, short, 300); len(got) != 3 {
		t.Fatalf("the longer list wins whichever side it is on, got %d", len(got))
	}
	if got := pickChapters(short, sameCountFurther, 1000); got[len(got)-1].EndTime != 900 {
		t.Fatalf("on a tie the list reaching further wins, got %v", got)
	}
}

func TestWorthSplitting(t *testing.T) {
	cases := []struct {
		name string
		info TrackInfo
		want bool
	}{
		{"a song people annotated", TrackInfo{Duration: 208}, false},
		{"a three-track upload of twelve minutes", TrackInfo{Duration: 720}, true},
		{"an hour-long mix with no chapters", TrackInfo{Duration: 3600}, true},
		{"a mix the uploader already split up", TrackInfo{Duration: 3600, Chapters: []Chapter{{Title: "Intro"}, {Title: "Nekozilla"}, {Title: "Ark"}}}, false},
		{"a mix whose chapters are only numbers", TrackInfo{Duration: 3600, Chapters: []Chapter{{Title: "1"}, {Title: "2"}, {Title: "3"}}}, true},
		{"nothing known about the length", TrackInfo{}, false},
	}
	for _, c := range cases {
		if got := worthSplitting(c.info); got != c.want {
			t.Errorf("%s: worthSplitting = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCommentArgs(t *testing.T) {
	args := strings.Join(commentArgs(), " ")

	if !strings.Contains(args, "--write-comments") {
		t.Fatalf("the comments are not asked for at all: %q", args)
	}
	for _, want := range []string{"comment_sort=top", "max_comments=100,all,0,0"} {
		if !strings.Contains(args, want) {
			t.Errorf("missing %q in %q", want, args)
		}
	}
}

func TestWorthAskingComments(t *testing.T) {
	none := 0
	some := 12
	cases := []struct {
		name string
		info TrackInfo
		want bool
	}{
		{"a video whose comment count is unknown", TrackInfo{}, true},
		{"a video with its comments turned off", TrackInfo{CommentCount: &none}, false},
		{"a video people commented on", TrackInfo{CommentCount: &some}, true},
	}
	for _, c := range cases {
		if got := worthAskingComments(c.info); got != c.want {
			t.Errorf("%s: worthAskingComments = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestLastError(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		want   string
	}{
		{"nothing said", "", ""},
		{"only blank lines", "\n  \n", ""},
		{"the reason under a warning", "WARNING: [youtube] Falling back\nERROR: [youtube] 3JtDLDmvSZY: Sign in to confirm you are not a bot\n", "Sign in to confirm you are not a bot"},
		{"a video youtube will not serve", "ERROR: [youtube] 3JtDLDmvSZY: This video is not available\n", "This video is not available"},
		{"an extractor with a colon in its name", "ERROR: [youtube:tab] ABC12345678: Playlist is private", "Playlist is private"},
		{"a reason that names no video", "ERROR: unable to open for writing: no space left", "unable to open for writing: no space left"},
		{"a label with nothing after it", "ERROR: [youtube]", ""},
	}
	for _, c := range cases {
		if got := lastError([]byte(c.stderr)); got != c.want {
			t.Errorf("%s: lastError = %q, want %q", c.name, got, c.want)
		}
	}

	long := lastError([]byte("ERROR: " + strings.Repeat("é", 1000)))
	if len([]rune(long)) != stderrExcerpt {
		t.Errorf("a long line came back with %d runes, want %d", len([]rune(long)), stderrExcerpt)
	}
}

func TestExtraArgs(t *testing.T) {
	args := strings.Join(extraArgs, " ")

	for _, want := range []string{"--js-runtimes bun", "--remote-components ejs:github"} {
		if !strings.Contains(args, want) {
			t.Errorf("every yt-dlp run should carry %q, got %q", want, args)
		}
	}
}

// The wordings YouTube puts in playabilityStatus, as yt-dlp relays them. They are YouTube's to
// change, which is why an unknown one has to have somewhere to land.
func TestCauseNamesWhatYouTubeSaid(t *testing.T) {
	cases := []struct {
		reason string
		want   string
	}{
		{"Private video. Sign in if you've been granted access to this video", "private"},
		{"Video unavailable. This video is private", "private"},
		{"Video unavailable", "unavailable"},
		{"This video has been removed by the uploader", "unavailable"},
		{"Sign in to confirm you're not a bot. Use --cookies for the authentication.", "signIn"},
		{"Sign in to confirm your age. This video may be inappropriate for some users.", "signIn"},
		{"Join this channel to get access to members-only content", "membersOnly"},
		{"This video is available to Music Premium members only", "membersOnly"},
		{"The uploader has not made this video available in your country", "geoBlocked"},
		{"Unsupported URL: https://example.com/watch?v=x", "unsupportedUrl"},
		{"unable to download video data: HTTP Error 403: Forbidden", ""},
		// macOS keeps its temporary files under /private, and a path is not a verdict
		// about the video.
		{"Unable to load cookies from /private/var/folders/t3/cookies.txt", ""},
		{"something YouTube has not written yet", ""},
	}

	for _, tc := range cases {
		t.Run(tc.reason, func(t *testing.T) {
			if got := Cause(&RunError{Reason: tc.reason, err: errors.New("exit status 1")}); got != tc.want {
				t.Fatalf("Cause(%q) = %q, want %q", tc.reason, got, tc.want)
			}
		})
	}
}

func TestCauseOfSomethingElseIsEmpty(t *testing.T) {
	if got := Cause(errors.New("boom")); got != "" {
		t.Fatalf("Cause() = %q, want \"\"", got)
	}
}

func TestReasonIsTheWholeLineForTheLog(t *testing.T) {
	failed := &RunError{Reason: "Unable to load cookies from /data/cookies.txt", err: errors.New("exit status 1")}

	if got := Reason(failed); got != failed.Reason {
		t.Fatalf("Reason() = %q, want the line yt-dlp printed", got)
	}
}

func TestRunErrorKeepsTheRunAndDropsThePath(t *testing.T) {
	failed := &RunError{
		Args:   []string{"--dump-json", "--cookies", "/data/cookies.txt", "https://youtu.be/x"},
		Reason: "Unable to load cookies from /data/cookies.txt",
		err:    errors.New("exit status 1"),
	}

	got := failed.Error()
	if strings.Contains(got, "/data/cookies.txt") {
		t.Fatalf("the cookies file reaches /api/tasks through %q", got)
	}

	for _, want := range []string{"--dump-json", "https://youtu.be/x", "exit status 1"} {
		if !strings.Contains(got, want) {
			t.Errorf("a log that cannot say %q is not worth reading: %q", want, got)
		}
	}
}
