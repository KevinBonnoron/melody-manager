// Package domain holds the core data types shared across providers and services, the Go
// counterpart of the TS shared/ package (which the client still uses.
package domain

// Chapter is a segment of a longer source, used to split an uploaded album video into
// individual tracks.
type Chapter struct {
	Title     string  `json:"title"`
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
}

// TrackMetadata is the metadata JSON stored on a track.
type TrackMetadata struct {
	Year          *int      `json:"year,omitempty"`
	Bitrate       *float64  `json:"bitrate,omitempty"`
	Format        string    `json:"format,omitempty"`
	Chapters      []Chapter `json:"chapters,omitempty"`
	StartTime     *float64  `json:"startTime,omitempty"`
	EndTime       *float64  `json:"endTime,omitempty"`
	ISRC          string    `json:"isrc,omitempty"`
	Label         string    `json:"label,omitempty"`
	ReleaseDate   string    `json:"releaseDate,omitempty"`
	TrackNumber   *int      `json:"trackNumber,omitempty"`
	TotalTracks   *int      `json:"totalTracks,omitempty"`
	DiscNumber    *int      `json:"discNumber,omitempty"`
	CoverArtURL   string    `json:"coverArtUrl,omitempty"`
	MusicbrainzID string    `json:"musicbrainzId,omitempty"`
	SpotifyID     string    `json:"spotifyId,omitempty"`
	YoutubeID     string    `json:"youtubeId,omitempty"`
	MeasuredFrom  *int64    `json:"measuredFrom,omitempty"`
}

// ResolvedTrack is what a provider returns when resolving a URL, not yet persisted.
type ResolvedTrack struct {
	Title          string        `json:"title"`
	Duration       int           `json:"duration"`
	Origin         string        `json:"origin"`
	ArtistName     string        `json:"artistName"`
	AlbumName      string        `json:"albumName"`
	CoverURL       string        `json:"coverUrl,omitempty"`
	ArtistImageURL string        `json:"artistImageUrl,omitempty"`
	Source         string        `json:"source"`
	Metadata       TrackMetadata `json:"metadata"`
}

// SearchResultType enumerates the kinds of search results.
type SearchResultType string

const (
	ResultTrack    SearchResultType = "track"
	ResultAlbum    SearchResultType = "album"
	ResultArtist   SearchResultType = "artist"
	ResultPlaylist SearchResultType = "playlist"
)

// SearchResult is a unified search hit (library or provider).
type SearchResult struct {
	Type      SearchResultType `json:"type"`
	ID        string           `json:"id,omitempty"`
	Title     string           `json:"title"`
	Subtitle  string           `json:"subtitle,omitempty"`
	Source    string           `json:"source"`
	Origin    string           `json:"origin,omitempty"`
	CoverURL  string           `json:"coverUrl,omitempty"`
	Duration  int              `json:"duration,omitempty"`
	InLibrary bool             `json:"inLibrary"`
}
