package providers

import "testing"

func TestDetectFromURLReadsTheLinksPeoplePaste(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"},
		{"http://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://youtu.be/dQw4w9WgXcQ", "youtube"},
		{"https://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://youtube.com:443/watch?v=dQw4w9WgXcQ", "youtube"},
		{"https://soundcloud.com/artist/track", "soundcloud"},
		{"https://www.soundcloud.com/artist/track", "soundcloud"},
		{"https://artist.bandcamp.com/track/song", "bandcamp"},
		{"https://open.spotify.com/track/abc", "spotify"},
	}

	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			if got := DetectFromURL(tc.raw); got != tc.want {
				t.Fatalf("DetectFromURL(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

// The ids we write ourselves, for a source already in the library.
func TestDetectFromURLReadsOurOwnSourceIds(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"youtube:dQw4w9WgXcQ", "youtube"},
		{"soundcloud:123456", "soundcloud"},
		{"bandcamp:https://artist.bandcamp.com/track/song", "bandcamp"},
		{"spotify:track:abc", "spotify"},
	}

	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			if got := DetectFromURL(tc.raw); got != tc.want {
				t.Fatalf("DetectFromURL(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

// A provider is chosen by the host the request will go to, and what is chosen here is what
// yt-dlp is later told to fetch. A link that only mentions a source is not from it.
func TestDetectFromURLWillNotBeTalkedIntoAHostThatIsNotThere(t *testing.T) {
	for _, raw := range []string{
		"http://169.254.169.254/?x=youtube.com",
		"http://169.254.169.254/latest/meta-data/?youtube",
		"http://127.0.0.1:8090/?x=youtube.com",
		"http://[::1]/?x=youtube.com",
		"http://192.168.1.1/?x=soundcloud.com",
		"https://youtube.com@169.254.169.254/",
		"https://youtube.com.evil.com/watch?v=x",
		"https://notyoutube.com/watch?v=x",
		"https://evil.com/?x=youtube.com",
		"https://evil.com/youtube.com/watch",
		"https://evil.com/#youtube.com",
		"https://evil.com/?x=bandcamp.com",
		"",
		"not a url at all",
		"youtube.com/watch?v=x",
	} {
		t.Run(raw, func(t *testing.T) {
			if got := DetectFromURL(raw); got != "" {
				t.Fatalf("DetectFromURL(%q) = %q, want no provider", raw, got)
			}
		})
	}
}
