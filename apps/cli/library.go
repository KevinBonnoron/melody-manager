package main

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

// Library retains the full track list as well as the albums used for browsing.
// Tracks with no known album remain available in Tracks.
type Library struct {
	Albums []LibraryAlbum
	Tracks []libraryTrack
}

type LibraryAlbum struct {
	Album  album
	Artist string
	Tracks []libraryTrack
}

func loadLibrary(c *client) (*Library, error) {
	albums, err := listRecords[album](c, "albums", url.Values{"sort": {"name,id"}})
	if err != nil {
		return nil, fmt.Errorf("load albums: %w", err)
	}
	artists, err := listRecords[artist](c, "artists", nil)
	if err != nil {
		return nil, fmt.Errorf("load artists: %w", err)
	}
	tracks, err := listRecords[track](c, "tracks", url.Values{"sort": {"title,id"}})
	if err != nil {
		return nil, fmt.Errorf("load tracks: %w", err)
	}

	artistNames := make(map[string]string, len(artists))
	for _, a := range artists {
		artistNames[a.ID] = a.Name
	}
	namesFor := func(ids []string) string {
		names := make([]string, 0, len(ids))
		for _, id := range ids {
			if name := artistNames[id]; name != "" {
				names = append(names, name)
			}
		}
		return strings.Join(names, ", ")
	}

	library := &Library{
		Albums: make([]LibraryAlbum, 0, len(albums)),
		Tracks: make([]libraryTrack, 0, len(tracks)),
	}
	albumIndex := make(map[string]int, len(albums))
	for _, a := range albums {
		albumIndex[a.ID] = len(library.Albums)
		library.Albums = append(library.Albums, LibraryAlbum{Album: a, Artist: namesFor(a.Artists)})
	}
	for _, t := range tracks {
		item := libraryTrack{track: t, artist: namesFor(t.Artists)}
		if index, ok := albumIndex[t.Album]; ok && t.Album != "" {
			item.album = library.Albums[index].Album.Name
			library.Albums[index].Tracks = append(library.Albums[index].Tracks, item)
		}
		library.Tracks = append(library.Tracks, item)
	}
	collator := collate.New(language.Und)
	for i := range library.Albums {
		albumTracks := library.Albums[i].Tracks
		sort.SliceStable(albumTracks, func(i, j int) bool {
			a, b := albumTracks[i], albumTracks[j]
			first, second := a.Metadata, b.Metadata
			if first.TrackNumber != nil && second.TrackNumber != nil {
				firstDisc, secondDisc := 1, 1
				if first.DiscNumber != nil {
					firstDisc = *first.DiscNumber
				}
				if second.DiscNumber != nil {
					secondDisc = *second.DiscNumber
				}
				if firstDisc != secondDisc {
					return firstDisc < secondDisc
				}
				if *first.TrackNumber != *second.TrackNumber {
					return *first.TrackNumber < *second.TrackNumber
				}
			} else if first.TrackNumber != nil || second.TrackNumber != nil {
				return first.TrackNumber != nil
			}
			if first.StartTime != nil && second.StartTime != nil {
				if *first.StartTime != *second.StartTime {
					return *first.StartTime < *second.StartTime
				}
			} else if first.StartTime != nil || second.StartTime != nil {
				return first.StartTime != nil
			}
			return collator.CompareString(a.Title, b.Title) < 0
		})
	}
	return library, nil
}

func loadAlbumCover(c *client, albumID string, rows int) ([]string, error) {
	how := detectRenderer()
	if albumID == "" || rows <= 0 || how == rendererNone {
		return nil, nil
	}
	data, err := c.bytesAt("/api/albums/" + url.PathEscape(albumID) + "/cover")
	if err != nil {
		var failure *apiError
		if errors.As(err, &failure) && failure.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("load album cover: %w", err)
	}
	return renderCover(data, rows, how)
}
