package services

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"github.com/KevinBonnoron/melody-manager/api/internal/covers"
	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/ffmpeg"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
)

var audioExts = map[string]bool{
	".mp3": true, ".flac": true, ".m4a": true, ".ogg": true,
	".opus": true, ".wav": true, ".aac": true, ".alac": true, ".wma": true,
}

// ScanLocal walks the local provider's configured directory, reads tags and
// persists any audio files not yet in the library. Returns the count added.
func ScanLocal(ctx context.Context, app core.App) (int, error) {
	dir := pbx.EffectiveConfig(app, "", "local").String("path")
	if dir == "" {
		return 0, nil
	}

	added := 0
	albumIDs := map[string]bool{}
	var firstErr error
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !audioExts[strings.ToLower(filepath.Ext(path))] {
			return nil
		}
		abs, _ := filepath.Abs(path)
		sourceURL := "file://" + abs
		if n, _ := app.CountRecords("tracks", dbx.NewExp("sourceUrl = {:u}", dbx.Params{"u": sourceURL})); n > 0 {
			return nil
		}
		albumID, perr := persistLocalFile(ctx, app, abs, sourceURL)
		if perr != nil {
			if firstErr == nil {
				firstErr = perr
			}
			return nil
		}
		albumIDs[albumID] = true
		added++
		return nil
	})

	// Files carrying no embedded picture leave their album bare; the lookup is
	// rate-limited, so it runs once per album after the walk rather than per
	// track during it.
	for id := range albumIDs {
		resolveAlbumCover(ctx, app, id)
	}

	if err == nil {
		err = firstErr
	}
	return added, err
}

func resolveAlbumCover(ctx context.Context, app core.App, albumID string) {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil || album.GetString("cover") != "" {
		return
	}
	artistIDs := album.GetStringSlice("artists")
	if len(artistIDs) == 0 {
		return
	}
	artist, err := app.FindRecordById("artists", artistIDs[0])
	if err != nil {
		return
	}
	if u := covers.AlbumCover(ctx, album.GetString("name"), artist.GetString("name")); u != "" {
		setCoverFromURL(ctx, app, album, u)
	}
}

// ImportLocalPath imports a single local audio file if it's not already in the
// library (used by the filesystem watcher).
func ImportLocalPath(ctx context.Context, app core.App, path string) error {
	if !audioExts[strings.ToLower(filepath.Ext(path))] {
		return nil
	}
	abs, _ := filepath.Abs(path)
	sourceURL := "file://" + abs
	if n, _ := app.CountRecords("tracks", dbx.NewExp("sourceUrl = {:u}", dbx.Params{"u": sourceURL})); n > 0 {
		return nil
	}
	albumID, err := persistLocalFile(ctx, app, abs, sourceURL)
	if err != nil {
		return err
	}
	resolveAlbumCover(ctx, app, albumID)
	return nil
}

// RemoveLocalByPath deletes the track(s) backed by a local file path.
func RemoveLocalByPath(app core.App, path string) {
	abs, _ := filepath.Abs(path)
	recs, err := app.FindRecordsByFilter("tracks", "sourceUrl = {:u}", "", 0, 0, dbx.Params{"u": "file://" + abs})
	if err != nil {
		return
	}
	for _, r := range recs {
		_ = app.Delete(r)
	}
}

func persistLocalFile(ctx context.Context, app core.App, path, sourceURL string) (string, error) {
	title := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	artistName, albumName := "Unknown Artist", "Unknown Album"
	var year *int
	var picture *tag.Picture

	if f, err := os.Open(path); err == nil {
		if m, err := tag.ReadFrom(f); err == nil {
			if v := m.Title(); v != "" {
				title = v
			}
			if v := m.Artist(); v != "" {
				artistName = v
			}
			if v := m.Album(); v != "" {
				albumName = v
			}
			if y := m.Year(); y != 0 {
				year = &y
			}
			picture = m.Picture()
		}
		_ = f.Close()
	}

	duration := 0
	if d, err := ffmpeg.ProbeDuration(ctx, path); err == nil {
		duration = int(d)
	}

	artist, err := getOrCreate(app, "artists", "name = {:n}", dbx.Params{"n": artistName}, func(r *core.Record) {
		r.Set("name", artistName)
	})
	if err != nil {
		return "", err
	}
	album, err := getOrCreate(app, "albums", "name = {:n} && artists ~ {:a}", dbx.Params{"n": albumName, "a": artist.Id}, func(r *core.Record) {
		r.Set("name", albumName)
		r.Set("artists", []string{artist.Id})
		if year != nil {
			r.Set("year", *year)
		}
	})
	if err != nil {
		return "", err
	}
	setEmbeddedCover(app, album, picture)

	meta := domain.TrackMetadata{LocalPath: path, Format: strings.TrimPrefix(filepath.Ext(path), "."), Year: year}
	_, err = getOrCreate(app, "tracks", "sourceUrl = {:u}", dbx.Params{"u": sourceURL}, func(r *core.Record) {
		r.Set("title", title)
		r.Set("duration", duration)
		r.Set("sourceUrl", sourceURL)
		r.Set("source", "local")
		r.Set("artists", []string{artist.Id})
		r.Set("album", album.Id)
		r.Set("metadata", meta)
	})
	return album.Id, err
}

// setEmbeddedCover uses the artwork stored in the audio file itself, which is
// both free and more faithful than any lookup by name.
func setEmbeddedCover(app core.App, album *core.Record, picture *tag.Picture) {
	if picture == nil || len(picture.Data) == 0 || album.GetString("cover") != "" {
		return
	}
	ext := picture.Ext
	if ext == "" {
		ext = "jpg"
	}
	f, err := filesystem.NewFileFromBytes(picture.Data, "cover."+ext)
	if err != nil {
		return
	}
	album.Set("cover", f)
	_ = app.Save(album)
}
