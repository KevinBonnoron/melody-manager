package services

import (
	"context"
	"errors"
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
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

var audioExts = map[string]bool{
	".mp3": true, ".flac": true, ".m4a": true, ".ogg": true,
	".opus": true, ".wav": true, ".aac": true, ".alac": true, ".wma": true,
}

// ScanLocalTask runs a scan as a reported task, so a walk nobody asked for still shows up where
// every other long job does.
func ScanLocalTask(ctx context.Context, app core.App, taskSvc *tasks.Service) *tasks.Task {
	task := taskSvc.Create("scan", "")
	go func() {
		taskSvc.Update(task.ID, func(t *tasks.Task) { t.Status = tasks.Running; t.Progress = 10 })
		res, err := ScanLocal(ctx, app)
		taskSvc.Update(task.ID, func(t *tasks.Task) {
			if err != nil {
				t.Status = tasks.Failed
				t.Error = err.Error()
				return
			}
			t.Status = tasks.Completed
			t.Progress = 100
			t.Count = res.Added + res.Restored
		})
	}()
	return task
}

// ScanResult is what a walk did.
type ScanResult struct {
	Added    int
	Restored int
}

// ScanLocal walks the local provider's configured directory, reads tags and persists any audio
// files not yet in the library.
func ScanLocal(ctx context.Context, app core.App) (ScanResult, error) {
	dir := pbx.EffectiveConfig(app, "", "local").String("path")
	if dir == "" {
		return ScanResult{}, nil
	}

	added := 0
	restored := 0
	albumIDs := map[string]bool{}
	downloaded := downloadedDirs(app)
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
		if n, _ := app.CountRecords("tracks", dbx.NewExp("origin = {:u}", dbx.Params{"u": sourceURL})); n > 0 {
			if merr := remeasureChanged(ctx, app, abs, sourceURL); merr != nil && firstErr == nil {
				firstErr = merr
			}
			if nerr := numberKnownTrack(app, abs, sourceURL); nerr != nil && firstErr == nil {
				firstErr = nerr
			}
			back, serr := SetLocalFilePresence(app, abs, true)
			restored += back
			if serr != nil && firstErr == nil {
				firstErr = serr
			}
			return nil
		}
		if downloaded[filepath.Dir(abs)] {
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

	for id := range albumIDs {
		resolveAlbumCover(ctx, app, id)
	}

	if err == nil {
		err = firstErr
	}
	return ScanResult{Added: added, Restored: restored}, err
}

type trackPlace struct {
	number *int
	total  *int
	disc   *int
}

func placeOf(m tag.Metadata) trackPlace {
	var place trackPlace
	if n, total := m.Track(); n > 0 {
		place.number = &n
		if total > 0 {
			place.total = &total
		}
	}
	if n, _ := m.Disc(); n > 0 {
		place.disc = &n
	}
	return place
}

func numberKnownTrack(app core.App, abs, sourceURL string) error {
	recs, err := app.FindRecordsByFilter("tracks", "origin = {:u}", "", 0, 0, dbx.Params{"u": sourceURL})
	if err != nil {
		return nil
	}

	metas := make([]domain.TrackMetadata, 0, len(recs))
	wanting := make([]*core.Record, 0, len(recs))
	for _, rec := range recs {
		var meta domain.TrackMetadata
		_ = rec.UnmarshalJSONField("metadata", &meta)
		if meta.TrackNumber != nil {
			continue
		}
		wanting = append(wanting, rec)
		metas = append(metas, meta)
	}
	if len(wanting) == 0 {
		return nil
	}

	f, err := os.Open(abs)
	if err != nil {
		return nil
	}
	defer func() { _ = f.Close() }()
	m, err := tag.ReadFrom(f)
	if err != nil {
		return nil
	}

	place := placeOf(m)
	if place.number == nil {
		return nil
	}

	var firstErr error
	for i, rec := range wanting {
		meta := metas[i]
		meta.TrackNumber, meta.TotalTracks, meta.DiscNumber = place.number, place.total, place.disc
		rec.Set("metadata", meta)
		if err := app.Save(rec); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func remeasureChanged(ctx context.Context, app core.App, abs, sourceURL string) error {
	info, err := os.Stat(abs)
	if err != nil {
		return nil
	}
	recs, err := app.FindRecordsByFilter("tracks", "origin = {:u}", "", 0, 0, dbx.Params{"u": sourceURL})
	if err != nil {
		return nil
	}

	mtime := info.ModTime().Unix()
	var seconds float64
	measured := false
	var firstErr error
	for _, rec := range recs {
		var meta domain.TrackMetadata
		_ = rec.UnmarshalJSONField("metadata", &meta)
		if !fileMovedOn(rec, meta, info, mtime) {
			continue
		}

		if !measured {
			read, perr := ffmpeg.ProbeDuration(ctx, abs)
			if perr != nil {
				return firstErr
			}
			seconds, measured = read, true
		}

		meta.MeasuredFrom = &mtime
		rec.Set("duration", int(seconds))
		rec.Set("metadata", meta)
		if err := app.Save(rec); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func fileMovedOn(rec *core.Record, meta domain.TrackMetadata, info os.FileInfo, mtime int64) bool {
	if meta.MeasuredFrom != nil {
		return *meta.MeasuredFrom != mtime
	}
	return info.ModTime().After(rec.GetDateTime("updated").Time())
}

func downloadedDirs(app core.App) map[string]bool {
	dirs := map[string]bool{}
	albums, err := app.FindAllRecords("albums")
	if err != nil {
		return dirs
	}

	roots := localRoots(app)
	for _, album := range albums {
		downloads, err := app.FindRecordsByFilter("tracks", "album = {:a} && source != {:s}", "", 1, 0, dbx.Params{"a": album.Id, "s": localSource})
		if err != nil || len(downloads) == 0 {
			continue
		}

		artistIDs := album.GetStringSlice("artists")
		if len(artistIDs) == 0 {
			continue
		}
		artist, err := app.FindRecordById("artists", artistIDs[0])
		if err != nil {
			continue
		}

		for _, root := range roots {
			if root == "" {
				continue
			}
			dirs[filepath.Join(root, sanitizeFilename(artist.GetString("name")), sanitizeFilename(album.GetString("name")))] = true
		}
	}

	return dirs
}

func fileClaimed(app core.App, abs string) bool {
	return downloadedDirs(app)[filepath.Dir(abs)]
}

func resolveAlbumCover(ctx context.Context, app core.App, albumID string) {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil || album.GetString("cover") != "" {
		return
	}
	_ = applyAlbumCover(ctx, app, album)
}

// RefreshAlbumCover looks the artwork up again and replaces what is there.
func RefreshAlbumCover(ctx context.Context, app core.App, albumID string) error {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	return applyAlbumCover(ctx, app, album)
}

func applyAlbumCover(ctx context.Context, app core.App, album *core.Record) error {
	artistIDs := album.GetStringSlice("artists")
	if len(artistIDs) == 0 {
		return errors.New("the album has no artist to search a cover on")
	}
	artist, err := app.FindRecordById("artists", artistIDs[0])
	if err != nil {
		return err
	}

	u := covers.AlbumCover(ctx, album.GetString("name"), artist.GetString("name"))
	if u == "" {
		return errors.New("no cover found for this album")
	}
	setCoverFromURL(ctx, app, album, u)
	return nil
}

// ImportLocalPath imports a single local audio file if it's not already in the library (used by
// the filesystem watcher).
func ImportLocalPath(ctx context.Context, app core.App, path string) error {
	if !audioExts[strings.ToLower(filepath.Ext(path))] {
		return nil
	}
	abs, _ := filepath.Abs(path)
	sourceURL := "file://" + abs
	if known, err := app.FindRecordsByFilter("tracks", "origin = {:u}", "", 0, 0, dbx.Params{"u": sourceURL}); err == nil && len(known) > 0 {
		_, serr := SetLocalFilePresence(app, path, true)
		return serr
	}
	if fileClaimed(app, abs) {
		return nil
	}
	albumID, err := persistLocalFile(ctx, app, abs, sourceURL)
	if err != nil {
		return err
	}
	resolveAlbumCover(ctx, app, albumID)
	return nil
}

// SetLocalFilePresence records that the file behind a path appeared or went away, and returns
// how many records that changed.
func SetLocalFilePresence(app core.App, path string, present bool) (int, error) {
	abs, _ := filepath.Abs(path)
	recs, err := app.FindRecordsByFilter("tracks", "origin = {:u}", "", 0, 0, dbx.Params{"u": "file://" + abs})
	if err != nil {
		return 0, err
	}

	changed := 0
	var firstErr error
	for _, r := range recs {
		next := AvailabilityFile
		if !present {
			next = AvailabilityStream
			if r.GetString("source") == localSource {
				next = AvailabilityNone
			}
		}
		if r.GetString("availability") == next {
			continue
		}
		r.Set("availability", next)
		if err := app.Save(r); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		changed++
	}

	return changed, firstErr
}

func persistLocalFile(ctx context.Context, app core.App, path, sourceURL string) (string, error) {
	title := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	artistName, albumName := "Unknown Artist", "Unknown Album"
	genreName := ""
	var year *int
	var picture *tag.Picture
	var place trackPlace

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
			genreName = strings.TrimSpace(m.Genre())
			picture = m.Picture()
			place = placeOf(m)
		}
		_ = f.Close()
	}

	duration := 0
	if d, err := ffmpeg.ProbeDuration(ctx, path); err == nil {
		duration = int(d)
	}

	names := splitArtistName(artistOnRecord(app), artistName, albumName, filepath.Base(filepath.Dir(path)))
	artistIDs := make([]string, 0, len(names))
	var artist *core.Record
	for _, name := range names {
		rec, err := getOrCreate(app, "artists", "name = {:n}", dbx.Params{"n": name}, func(r *core.Record) {
			r.Set("name", name)
		})
		if err != nil {
			return "", err
		}
		if artist == nil {
			artist = rec
		}
		artistIDs = append(artistIDs, rec.Id)
	}
	if artist == nil {
		return "", errors.New("the file names no artist")
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
	creditOnAlbum(app, album, artistIDs)
	setEmbeddedCover(app, album, picture)

	genreIDs := []string{}
	if genreName != "" {
		if genre, err := getOrCreate(app, "genres", "name = {:n}", dbx.Params{"n": genreName}, func(r *core.Record) {
			r.Set("name", genreName)
		}); err == nil {
			genreIDs = append(genreIDs, genre.Id)
		}
	}

	meta := domain.TrackMetadata{
		Format:      strings.TrimPrefix(filepath.Ext(path), "."),
		Year:        year,
		TrackNumber: place.number,
		TotalTracks: place.total,
		DiscNumber:  place.disc,
	}
	rec, err := getOrCreate(app, "tracks", "origin = {:u}", dbx.Params{"u": sourceURL}, func(r *core.Record) {
		r.Set("title", title)
		r.Set("duration", duration)
		r.Set("origin", sourceURL)
		r.Set("source", "local")
		r.Set("availability", AvailabilityFile)
		r.Set("artists", artistIDs)
		r.Set("album", album.Id)
		r.Set("genres", genreIDs)
		r.Set("metadata", meta)
	})
	if err != nil {
		return "", err
	}

	if rec.GetString("availability") != AvailabilityFile {
		rec.Set("availability", AvailabilityFile)
		if err := app.Save(rec); err != nil {
			return "", err
		}
	}

	return album.Id, nil
}

func creditOnAlbum(app core.App, album *core.Record, artistIDs []string) {
	current := album.GetStringSlice("artists")
	known := map[string]bool{}
	for _, id := range current {
		known[id] = true
	}

	added := false
	for _, id := range artistIDs {
		if known[id] {
			continue
		}
		known[id] = true
		current = append(current, id)
		added = true
	}
	if !added {
		return
	}

	album.Set("artists", current)
	_ = app.Save(album)
}

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
