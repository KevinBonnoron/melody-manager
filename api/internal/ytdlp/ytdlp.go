// Package ytdlp wraps the yt-dlp binary (provided by the nix dev shell) used by
// the youtube, soundcloud and bandcamp providers for metadata, stream URLs and
// downloads.
package ytdlp

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// Chapter is a yt-dlp chapter (or one parsed from the description).
type Chapter struct {
	Title     string  `json:"title"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
}

// TrackInfo is the subset of yt-dlp's JSON we use.
type TrackInfo struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Duration    float64   `json:"duration"`
	WebpageURL  string    `json:"webpage_url"`
	Thumbnail   string    `json:"thumbnail"`
	Artist      string    `json:"artist"`
	Uploader    string    `json:"uploader"`
	Channel     string    `json:"channel"`
	Album       string    `json:"album"`
	UploadDate  string    `json:"upload_date"`
	Ext         string    `json:"ext"`
	TBR         float64   `json:"tbr"`
	Description string    `json:"description"`
	Chapters    []Chapter `json:"chapters"`
}

var streamURLCache, _ = lru.New[string, string](1000)

const extractorArgs = "youtube:player_client=default"

func cookieArgs(cookiesFile string) []string {
	if cookiesFile == "" {
		return nil
	}
	return []string{"--cookies", cookiesFile}
}

func run(ctx context.Context, args ...string) ([]byte, error) {
	out, err := exec.CommandContext(ctx, "yt-dlp", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp %s: %w", strings.Join(args, " "), err)
	}
	return out, nil
}

// StreamURL resolves a direct audio URL for the source (cached 4h).
func StreamURL(ctx context.Context, sourceURL, cookiesFile string) (string, error) {
	if v, ok := streamURLCache.Get(sourceURL); ok {
		return v, nil
	}

	format := "bestaudio"
	switch {
	case strings.Contains(sourceURL, "youtube.com"), strings.Contains(sourceURL, "youtu.be"):
		format = "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"
	case strings.Contains(sourceURL, "soundcloud.com"):
		format = "bestaudio"
	default:
		format = "bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]/bestaudio"
	}

	args := append([]string{"-f", format, "-g"}, cookieArgs(cookiesFile)...)
	args = append(args, sourceURL)
	out, err := run(ctx, args...)
	if err != nil {
		return "", err
	}
	url := strings.TrimSpace(string(out))
	streamURLCache.Add(sourceURL, url)
	return url, nil
}

// InvalidateStreamURL drops a cached stream URL (e.g. after a 403).
func InvalidateStreamURL(sourceURL string) { streamURLCache.Remove(sourceURL) }

// ExtractTrackInfo fetches metadata for a single track and, when the embedded
// chapters are missing/poor, derives them from the description.
func ExtractTrackInfo(ctx context.Context, url, cookiesFile string) (*TrackInfo, error) {
	args := append([]string{"-j", "--no-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, "--extractor-args", extractorArgs, url)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var info TrackInfo
	if err := json.Unmarshal(out, &info); err != nil {
		return nil, err
	}

	if needsChapterRecovery(info) && info.Description != "" && info.Duration > 0 {
		if derived := ParseChapters(info.Description, info.Duration); len(derived) > 1 {
			info.Chapters = derived
		}
	}
	for i := range info.Chapters {
		info.Chapters[i].Title = cleanTitle(info.Chapters[i].Title)
	}
	return &info, nil
}

func needsChapterRecovery(info TrackInfo) bool {
	if len(info.Chapters) <= 1 {
		return true
	}
	allNumeric := true
	for _, c := range info.Chapters {
		if !regexp.MustCompile(`^\d+[.)]*\s*$`).MatchString(strings.TrimSpace(c.Title)) {
			allNumeric = false
			break
		}
	}
	return allNumeric
}

// ExtractPlaylistTracks returns the (flat) entries of a playlist.
func ExtractPlaylistTracks(ctx context.Context, url, cookiesFile string) ([]TrackInfo, error) {
	args := append([]string{"-j", "--flat-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, "--extractor-args", extractorArgs, url)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var tracks []TrackInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var info TrackInfo
		if err := json.Unmarshal([]byte(line), &info); err != nil {
			continue
		}
		if info.Thumbnail == "" && info.ID != "" {
			info.Thumbnail = "https://i.ytimg.com/vi/" + info.ID + "/mqdefault.jpg"
		}
		if info.WebpageURL == "" && info.ID != "" {
			info.WebpageURL = "https://www.youtube.com/watch?v=" + info.ID
		}
		tracks = append(tracks, info)
	}
	return tracks, nil
}

// PlaylistInfo is the summary of a playlist.
type PlaylistInfo struct {
	Title      string
	Thumbnail  string
	TrackCount int
}

// ExtractPlaylistInfo returns a playlist's title/thumbnail/count.
func ExtractPlaylistInfo(ctx context.Context, url, cookiesFile string) (*PlaylistInfo, error) {
	args := append([]string{"--dump-single-json", "--flat-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, "--extractor-args", extractorArgs, url)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var data struct {
		Title      string `json:"title"`
		Thumbnails []struct {
			URL string `json:"url"`
		} `json:"thumbnails"`
		Entries []json.RawMessage `json:"entries"`
	}
	if err := json.Unmarshal(out, &data); err != nil {
		return nil, err
	}
	info := &PlaylistInfo{Title: data.Title, TrackCount: len(data.Entries)}
	if info.Title == "" {
		info.Title = "Unknown Playlist"
	}
	if n := len(data.Thumbnails); n > 0 {
		info.Thumbnail = data.Thumbnails[n-1].URL
	}
	return info, nil
}

// DownloadAudio downloads the best audio to a temp file and returns its path.
func DownloadAudio(ctx context.Context, url string) (string, error) {
	output := filepath.Join(os.TempDir(), fmt.Sprintf("yt-audio-%d.%%(ext)s", time.Now().UnixNano()))
	format := "bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]/bestaudio"
	out, err := run(ctx, "-f", format, "-o", output, "--extractor-args", extractorArgs, "--print", "after_move:filepath", url)
	if err != nil {
		return "", err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	path := lines[len(lines)-1]
	if path == "" {
		return "", fmt.Errorf("yt-dlp did not return a file path")
	}
	return path, nil
}

// BuildResolvedTrack maps yt-dlp info to a domain ResolvedTrack.
func BuildResolvedTrack(info TrackInfo, source string) domain.ResolvedTrack {
	artist := firstNonEmpty(info.Artist, info.Uploader, info.Channel, "Unknown Artist")
	album := info.Album
	if album == "" {
		album = fmt.Sprintf("%s - %s", firstNonEmpty(info.Channel, info.Uploader), source)
	}
	thumb := info.Thumbnail
	if strings.HasPrefix(thumb, "data:") {
		thumb = ""
	}
	meta := domain.TrackMetadata{Format: info.Ext, CoverArtURL: thumb}
	if info.TBR > 0 {
		b := info.TBR
		meta.Bitrate = &b
	}
	if len(info.UploadDate) >= 4 {
		if y, err := strconv.Atoi(info.UploadDate[:4]); err == nil {
			meta.Year = &y
		}
	}
	return domain.ResolvedTrack{
		Title:      info.Title,
		Duration:   int(math.Floor(info.Duration)),
		SourceURL:  info.WebpageURL,
		ArtistName: artist,
		AlbumName:  album,
		CoverURL:   thumb,
		Source:     source,
		Metadata:   meta,
	}
}

var timestampRe = regexp.MustCompile(`(\d+):(\d{2})(?::(\d{2}))?`)
var leadingNumRe = regexp.MustCompile(`^\s*\d+(?:-\d+)?[.)]?\s+`)

// ParseChapters derives chapters from free text (description/comment). Go's
// RE2 has no lookbehind, so this is a line-based port (not the exact JS regex
// set) that handles the common "Title TIMESTAMP" / "TIMESTAMP Title" formats.
func ParseChapters(text string, duration float64) []Chapter {
	var chapters []Chapter
	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		loc := timestampRe.FindStringIndex(line)
		if loc == nil {
			continue
		}
		m := timestampRe.FindStringSubmatch(line)
		secs := atoi(m[1])*60 + atoi(m[2])
		if m[3] != "" {
			secs = atoi(m[1])*3600 + atoi(m[2])*60 + atoi(m[3])
		}
		title := strings.TrimSpace(line[:loc[0]] + line[loc[1]:])
		title = strings.Trim(title, " -–—[]:·")
		title = leadingNumRe.ReplaceAllString(title, "")
		title = strings.TrimSpace(title)
		if title == "" {
			continue
		}
		chapters = append(chapters, Chapter{Title: title, StartTime: float64(secs)})
	}
	if len(chapters) == 0 {
		return nil
	}
	sort.SliceStable(chapters, func(i, j int) bool { return chapters[i].StartTime < chapters[j].StartTime })
	for i := range chapters {
		if i+1 < len(chapters) {
			chapters[i].EndTime = chapters[i+1].StartTime
		} else {
			chapters[i].EndTime = duration
		}
		if chapters[i].EndTime <= chapters[i].StartTime {
			chapters[i].EndTime = chapters[i].StartTime + 1
		}
	}
	return chapters
}

func cleanTitle(s string) string {
	s = strings.TrimSpace(s)
	s = leadingNumRe.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func atoi(s string) int { n, _ := strconv.Atoi(s); return n }
