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

// ScanLocalTask runs a scan as a reported task, so a walk nobody asked for
// still shows up where every other long job does. Returns the task so a caller
// answering a request can hand it back.
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
			// What the walk changed, found and put back alike: a scan that only
			// puts files back reporting nothing is what sends someone looking for
			// a fault that is already fixed.
			t.Count = res.Added + res.Restored
		})
	}()
	return task
}

// ScanResult is what a walk did: what it saw for the first time, and what it put
// back, a file the library had down as missing and that is plainly still there.
type ScanResult struct {
	Added    int
	Restored int
}

// ScanLocal walks the local provider's configured directory, reads tags and
// persists any audio files not yet in the library.
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
		// A file already known is not read again: the tags and the duration cost
		// a probe apiece, and they have not changed. What may have changed is
		// whether the record still believes the file is there, and a scan that
		// just walked over it is in a position to say. That is the first thing
		// anyone reaches for when files have gone astray, and it used to be the
		// one pass that could see them and not say so.
		//
		// Through the same helper the watcher uses, rather than a second way of
		// saying it here: a path can name more than one record, and that is the
		// sort of thing two implementations disagree about.
		if n, _ := app.CountRecords("tracks", dbx.NewExp("origin = {:u}", dbx.Params{"u": sourceURL})); n > 0 {
			if merr := remeasureChanged(ctx, app, abs, sourceURL); merr != nil && firstErr == nil {
				firstErr = merr
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

	// Files carrying no embedded picture leave their album bare; the lookup is
	// rate-limited, so it runs once per album after the walk rather than per
	// track during it.
	for id := range albumIDs {
		resolveAlbumCover(ctx, app, id)
	}

	if err == nil {
		err = firstErr
	}
	return ScanResult{Added: added, Restored: restored}, err
}

// remeasureChanged re-reads a duration when the file has changed since it was
// measured, which is how a track imported mid-write is repaired: the walk
// otherwise never looks at a file it already knows. Tags survive such an import,
// sitting at the head of the file, so only the duration is read again.
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
				// Nothing written, the watermark included, so the next walk retries.
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

// fileMovedOn reports whether the file has changed since its duration was read.
// A record written before there was a watermark falls back to its updated stamp,
// which anything else saving the record advances, so it can only be approximate.
func fileMovedOn(rec *core.Record, meta domain.TrackMetadata, info os.FileInfo, mtime int64) bool {
	if meta.MeasuredFrom != nil {
		return *meta.MeasuredFrom != mtime
	}
	return info.ModTime().After(rec.GetDateTime("updated").Time())
}

// downloadedDirs are the album folders another source downloaded into. A
// provider's download directory is often the music directory itself, so the
// walk would otherwise take everything it wrote for a second, local copy.
//
// The folder is the unit, not the file: a track renamed since it was fetched no
// longer derives the name it was written under, and what it left behind is a
// stale download, not something the operator put there.
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

// fileClaimed is the single-file form, for the watcher: a download landing in
// the watched directory raises the same event as a file someone copied there.
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

// RefreshAlbumCover looks the artwork up again and replaces what is there. The
// import-time resolver keeps the first thing it finds, which is right at import
// and wrong when someone asks for it to be done over.
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

// ImportLocalPath imports a single local audio file if it's not already in the
// library (used by the filesystem watcher).
func ImportLocalPath(ctx context.Context, app core.App, path string) error {
	if !audioExts[strings.ToLower(filepath.Ext(path))] {
		return nil
	}
	abs, _ := filepath.Abs(path)
	sourceURL := "file://" + abs
	// A file that comes back is the same track returning, not a new one: its
	// likes, plays and playlists are still pointing at it.
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

// SetLocalFilePresence records that the file behind a path appeared or went
// away, and returns how many records that changed. A file disappearing used to
// delete the record outright, which threw away the likes, the play counts and
// every playlist entry pointing at it, for what is often a disk being unmounted
// or a folder being moved.
//
// Every record naming that path, not the first: nothing stops two tracks
// sharing an origin, and leaving the others behind is how half a library comes
// back.
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
			// Losing the file costs a local track everything, and a downloaded
			// one only its copy.
			next = AvailabilityStream
			if r.GetString("source") == localSource {
				next = AvailabilityNone
			}
		}
		if r.GetString("availability") == next {
			continue
		}
		r.Set("availability", next)
		// The rest of the records are still written: they name the same file and
		// one refusing says nothing about the others. The failure travels, so a
		// scan that repaired half a library reports as much rather than as a
		// success.
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

	// The tag carries the genre whole ("Future Bass", "J-Pop"); store it as-is.
	// The legacy importer split composites apart, which is where the stray "J-"
	// in the genre list comes from.
	genreIDs := []string{}
	if genreName != "" {
		if genre, err := getOrCreate(app, "genres", "name = {:n}", dbx.Params{"n": genreName}, func(r *core.Record) {
			r.Set("name", genreName)
		}); err == nil {
			genreIDs = append(genreIDs, genre.Id)
		}
	}

	// The origin is the file: nothing else has to record where it sits.
	meta := domain.TrackMetadata{Format: strings.TrimPrefix(filepath.Ext(path), "."), Year: year}
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

	// Reached for a file the walk did not already know, but ImportLocalPath comes
	// through here too, and a record that says the file is missing has just been
	// contradicted by reading it.
	if rec.GetString("availability") != AvailabilityFile {
		rec.Set("availability", AvailabilityFile)
		if err := app.Save(rec); err != nil {
			return "", err
		}
	}

	return album.Id, nil
}

// creditOnAlbum adds anyone credited on a track to the album they appear on, so
// browsing that artist finds the record. The first stays where it is: it is the
// album's own artist, the one its cover lookup and its folder are named after.
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
