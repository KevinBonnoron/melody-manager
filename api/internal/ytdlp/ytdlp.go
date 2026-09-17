// Package ytdlp wraps the yt-dlp binary (provided by the nix dev shell) used by the youtube,
// soundcloud and bandcamp providers for metadata, stream URLs and downloads.
package ytdlp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"

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
	ChannelURL  string    `json:"channel_url"`
	UploaderURL string    `json:"uploader_url"`
	Album       string    `json:"album"`
	UploadDate  string    `json:"upload_date"`
	Ext         string    `json:"ext"`
	TBR         float64   `json:"tbr"`
	Description string    `json:"description"`
	Chapters    []Chapter `json:"chapters"`
	Comments    []Comment `json:"comments"`

	// CommentCount is nil when yt-dlp does not know, and 0 when the video has none.
	CommentCount *int `json:"comment_count"`
}

// Comment is the subset of a yt-dlp comment we use.
type Comment struct {
	Text   string `json:"text"`
	Parent string `json:"parent"`
}

var streamURLCache = expirable.NewLRU[string, string](1000, nil, streamURLTTL)

var extraArgs = []string{"--js-runtimes", "bun"}

func cookieArgs(cookiesFile string) []string {
	if cookiesFile == "" {
		return nil
	}
	return []string{"--cookies", cookiesFile}
}

func validateURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid url %q: %w", raw, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("unsupported url scheme %q", u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("url %q has no host", raw)
	}
	return nil
}

// RunError is a yt-dlp run that came back empty-handed, carrying the reason it printed.
type RunError struct {
	Args   []string
	Reason string
	err    error
}

// The arguments say which run failed, which is most of what a log is for, but a failed import
// keeps its error on the task and /api/tasks hands every task to every signed-in caller: the
// cookies file, the cache directory and the temporary file go no further than this process.
func (r *RunError) Error() string {
	args := withoutPaths(strings.Join(r.Args, " "))
	if r.Reason == "" {
		return fmt.Sprintf("yt-dlp %s: %v", args, r.err)
	}
	return fmt.Sprintf("yt-dlp %s: %v: %s", args, r.err, withoutPaths(r.Reason))
}

func (r *RunError) Unwrap() error { return r.err }

// Reason is the whole of what yt-dlp said went wrong, for the server's log and nowhere else.
// What a caller is told is Cause.
func Reason(err error) string {
	var failed *RunError
	if errors.As(err, &failed) {
		return failed.Reason
	}
	return ""
}

// Cause names what went wrong in a word this server chose, or "" for a reason it does not
// recognise. The text it reads is YouTube's own, relayed by yt-dlp out of playabilityStatus
// and reworded server-side whenever they like, so recognising it is a guess that has to be
// allowed to fail: a caller is told nothing rather than told something unread.
func Cause(err error) string {
	reason := strings.ToLower(Reason(err))
	switch {
	case reason == "":
		return ""
	case strings.Contains(reason, "private video"), strings.Contains(reason, "video is private"):
		return "private"
	case strings.Contains(reason, "available in your country"), strings.Contains(reason, "blocked it in your country"):
		return "geoBlocked"
	case strings.Contains(reason, "members-only"), strings.Contains(reason, "members only"), strings.Contains(reason, "premium"):
		return "membersOnly"
	case strings.Contains(reason, "sign in"), strings.Contains(reason, "age-restricted"), strings.Contains(reason, "inappropriate for some users"):
		return "signIn"
	case strings.Contains(reason, "unsupported url"):
		return "unsupportedUrl"
	case strings.Contains(reason, "unavailable"), strings.Contains(reason, "has been removed"), strings.Contains(reason, "no longer exists"):
		return "unavailable"
	}
	return ""
}

var windowsPath = regexp.MustCompile(`^[A-Za-z]:[\\/]`)

// withoutPaths keeps the reason and drops where the server keeps its files: yt-dlp names the
// cookies file, its cache directory or a temporary file when it cannot read one, and none of
// that tells whoever asked anything about the video. A URL is left alone, being the answer to
// what was asked rather than a corner of the disk.
func withoutPaths(reason string) string {
	fields := strings.Fields(reason)
	for i, field := range fields {
		if strings.Contains(field, "://") {
			continue
		}

		bare := strings.TrimLeft(field, `'"([<`)
		if strings.HasPrefix(bare, "/") || strings.HasPrefix(bare, "~/") || windowsPath.MatchString(bare) {
			fields[i] = "..."
		}
	}
	return strings.Join(fields, " ")
}

func run(ctx context.Context, args ...string) ([]byte, error) {
	out, err := exec.CommandContext(ctx, "yt-dlp", args...).Output()
	if err == nil {
		return out, nil
	}

	// "exit status 1" says nothing about what yt-dlp refused to do; its last line does.
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return nil, &RunError{Args: args, Reason: lastError(exit.Stderr), err: err}
	}
	return nil, &RunError{Args: args, err: err}
}

const stderrExcerpt = 400

// lastError is the last thing yt-dlp said on stderr, which is where it puts the reason.
func lastError(stderr []byte) string {
	lines := strings.Split(strings.TrimSpace(string(stderr)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		if runes := []rune(line); len(runes) > stderrExcerpt {
			return string(runes[:stderrExcerpt])
		}
		return line
	}
	return ""
}

const streamURLTTL = 4 * time.Hour

// StreamURL resolves a direct audio URL for the source (cached for streamURLTTL).
func StreamURL(ctx context.Context, sourceURL, cookiesFile string) (string, error) {
	if err := validateURL(sourceURL); err != nil {
		return "", err
	}
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
	args = append(args, "--", sourceURL)
	out, err := run(ctx, args...)
	if err != nil {
		return "", err
	}
	url := strings.TrimSpace(string(out))
	streamURLCache.Add(sourceURL, url)
	return url, nil
}

// InvalidateStreamURL drops a cached stream URL (e.g.
func InvalidateStreamURL(sourceURL string) { streamURLCache.Remove(sourceURL) }

const multiTrackLength = 10 * time.Minute

func worthSplitting(info TrackInfo) bool {
	return info.Duration >= multiTrackLength.Seconds() && needsChapterRecovery(info)
}

// ExtractTrackInfo fetches metadata for a single track and, when the embedded chapters are
// missing or poor, derives them from the description and, failing that, from the comments.
func ExtractTrackInfo(ctx context.Context, url, cookiesFile string) (*TrackInfo, error) {
	if err := validateURL(url); err != nil {
		return nil, err
	}
	info, err := extractInfo(ctx, url, cookiesFile)
	if err != nil {
		return nil, err
	}

	if worthSplitting(*info) {
		fromDescription := ParseChapters(info.Description, info.Duration)
		if len(fromDescription) <= 1 {
			fromDescription = nil
		}

		var fromComments []Chapter
		if worthAskingComments(*info) {
			fromComments = chaptersFromComments(ctx, url, cookiesFile, info.Duration)
		}

		if best := pickChapters(fromDescription, fromComments, info.Duration); len(best) > 1 {
			info.Chapters = best
		}
	}
	for i := range info.Chapters {
		info.Chapters[i].Title = cleanTitle(info.Chapters[i].Title)
	}
	return info, nil
}

func extractInfo(ctx context.Context, url, cookiesFile string, extra ...string) (*TrackInfo, error) {
	args := append([]string{"-j", "--no-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, extraArgs...)
	args = append(args, extra...)
	args = append(args, "--", url)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var info TrackInfo
	if err := json.Unmarshal(out, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

const topComments = 100

func commentArgs() []string {
	return []string{
		"--write-comments",
		"--extractor-args",
		fmt.Sprintf("youtube:comment_sort=top;max_comments=%d,all,0,0", topComments),
	}
}

// worthAskingComments says whether the slow comment pass could still find a track list: a
// video that reports no comments has none to read, and asking anyway only costs a yt-dlp run
// that comes back empty, or hangs on a video whose comments are turned off.
func worthAskingComments(info TrackInfo) bool {
	return info.CommentCount == nil || *info.CommentCount > 0
}

// commentsTimeout keeps a video whose comments will not come to an end of its own: reading
// them is worth a wait, but never the whole request.
const commentsTimeout = 60 * time.Second

func chaptersFromComments(ctx context.Context, url, cookiesFile string, duration float64) []Chapter {
	ctx, cancel := context.WithTimeout(ctx, commentsTimeout)
	defer cancel()

	info, err := extractInfo(ctx, url, cookiesFile, commentArgs()...)
	if err != nil {
		return nil
	}

	var best []Chapter
	for _, comment := range info.Comments {
		if comment.Parent != "root" {
			continue
		}

		chapters := ParseChapters(comment.Text, duration)
		if len(chapters) <= 1 {
			continue
		}
		if len(chapters) > len(best) || (len(chapters) == len(best) && coverage(chapters, duration) > coverage(best, duration)) {
			best = chapters
		}
	}

	return best
}

func pickChapters(fromDescription, fromComments []Chapter, duration float64) []Chapter {
	switch {
	case len(fromDescription) == 0:
		return fromComments
	case len(fromComments) == 0:
		return fromDescription
	case len(fromComments) > len(fromDescription):
		return fromComments
	case len(fromDescription) > len(fromComments):
		return fromDescription
	}

	if coverage(fromComments, duration) >= coverage(fromDescription, duration) {
		return fromComments
	}
	return fromDescription
}

func coverage(chapters []Chapter, duration float64) float64 {
	if len(chapters) == 0 || duration <= 0 {
		return 0
	}
	return math.Min(1, chapters[len(chapters)-1].EndTime/duration)
}

var numberedTitleRe = regexp.MustCompile(`^\d+[.)]*\s*$`)

func needsChapterRecovery(info TrackInfo) bool {
	if len(info.Chapters) <= 1 {
		return true
	}

	allNumeric := true
	for _, c := range info.Chapters {
		if !numberedTitleRe.MatchString(strings.TrimSpace(c.Title)) {
			allNumeric = false
			break
		}
	}
	if allNumeric {
		return true
	}

	return lastChapterOutsized(info.Chapters)
}

const outsizedLastChapter = 3

func lastChapterOutsized(chapters []Chapter) bool {
	last := chapters[len(chapters)-1]
	var total float64
	for _, c := range chapters[:len(chapters)-1] {
		total += c.EndTime - c.StartTime
	}

	average := total / float64(len(chapters)-1)
	return average > 0 && last.EndTime-last.StartTime > average*outsizedLastChapter
}

var searchSpecRe = regexp.MustCompile(`^(yt|sc)search\d*:`)

// SearchEntries runs a yt-dlp search spec (ytsearch20:…, scsearch20:…).
func SearchEntries(ctx context.Context, spec, cookiesFile string) ([]TrackInfo, error) {
	if !searchSpecRe.MatchString(spec) {
		return nil, fmt.Errorf("invalid search spec %q", spec)
	}
	args := append([]string{"-j", "--flat-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, extraArgs...)
	args = append(args, "--", spec)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	return parseTrackInfoLines(out), nil
}

// ExtractPlaylistTracks returns the (flat) entries of a playlist.
func ExtractPlaylistTracks(ctx context.Context, url, cookiesFile string) ([]TrackInfo, error) {
	if err := validateURL(url); err != nil {
		return nil, err
	}
	args := append([]string{"-j", "--flat-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, extraArgs...)
	args = append(args, "--", url)
	out, err := run(ctx, args...)
	if err != nil {
		return nil, err
	}
	return parseTrackInfoLines(out), nil
}

func parseTrackInfoLines(out []byte) []TrackInfo {
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
	return tracks
}

// PlaylistInfo is the summary of a playlist.
type PlaylistInfo struct {
	Title      string
	Thumbnail  string
	TrackCount int
}

// ExtractPlaylistInfo returns a playlist's title/thumbnail/count.
func ExtractPlaylistInfo(ctx context.Context, url, cookiesFile string) (*PlaylistInfo, error) {
	if err := validateURL(url); err != nil {
		return nil, err
	}
	args := append([]string{"--dump-single-json", "--flat-playlist"}, cookieArgs(cookiesFile)...)
	args = append(args, extraArgs...)
	args = append(args, "--", url)
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
	if err := validateURL(url); err != nil {
		return "", err
	}
	output := filepath.Join(os.TempDir(), fmt.Sprintf("yt-audio-%d.%%(ext)s", time.Now().UnixNano()))
	format := "bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]/bestaudio"
	args := append([]string{"-f", format, "-o", output}, extraArgs...)
	args = append(args, "--print", "after_move:filepath", "--", url)
	out, err := run(ctx, args...)
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
		Origin:     info.WebpageURL,
		ArtistName: artist,
		AlbumName:  album,
		CoverURL:   thumb,
		Source:     source,
		Metadata:   meta,
	}
}

var timestampRe = regexp.MustCompile(`(\d+):(\d{2})(?::(\d{2}))?`)
var leadingNumRe = regexp.MustCompile(`^\s*\d+(?:-\d+)?[.)]?\s+`)

// ParseChapters derives chapters from free text (description/comment).
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
		title = strings.ReplaceAll(title, "[]", "")
		title = strings.Trim(title, " -–::·")
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

// ChannelAvatar returns the channel's avatar URL.
func ChannelAvatar(ctx context.Context, channelURL, cookiesFile string) string {
	if channelURL == "" || validateURL(channelURL) != nil {
		return ""
	}

	args := append([]string{"-J", "--playlist-items", "0"}, cookieArgs(cookiesFile)...)
	args = append(args, extraArgs...)
	args = append(args, "--", channelURL)
	out, err := run(ctx, args...)
	if err != nil {
		return ""
	}

	var payload struct {
		Thumbnails []struct {
			ID     string `json:"id"`
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"thumbnails"`
	}
	if err := json.Unmarshal(out, &payload); err != nil {
		return ""
	}

	best, bestSize := "", 0
	for _, t := range payload.Thumbnails {
		if t.URL == "" || t.Width == 0 || t.Width != t.Height {
			continue
		}
		if t.Width > bestSize {
			best, bestSize = t.URL, t.Width
		}
	}
	return best
}
