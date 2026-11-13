package services

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/pocketbase/pocketbase/core"
)

// ErrNameTaken is returned when a rename would land on a directory that is already someone
// else's.
var ErrNameTaken = errors.New("a folder of that name already exists")

type move struct {
	from string
	to   string
}

func planned(moves []move) []move {
	out := make([]move, 0, len(moves))
	for _, m := range moves {
		if m.from == m.to || !isDir(m.from) {
			continue
		}
		out = append(out, m)
	}

	return out
}

func checkDestinations(moves []move) error {
	for _, m := range moves {
		if exists(m.to) {
			return fmt.Errorf("%w: %s", ErrNameTaken, m.to)
		}
	}

	return nil
}

func applyMoves(moves []move) error {
	done := make([]move, 0, len(moves))
	for _, m := range moves {
		if err := os.MkdirAll(filepath.Dir(m.to), 0o755); err != nil {
			return errors.Join(err, undoMoves(done))
		}
		if err := movePath(m.from, m.to); err != nil {
			return errors.Join(err, undoMoves(done))
		}
		done = append(done, m)
	}

	return nil
}

func undoMoves(done []move) error {
	var errs []error
	for i := len(done) - 1; i >= 0; i-- {
		if err := movePath(done[i].to, done[i].from); err != nil {
			errs = append(errs, fmt.Errorf("rollback %s to %s: %w", done[i].to, done[i].from, err))
		}
	}
	return errors.Join(errs...)
}

// movePath uses an atomic no-replace operation for files. Directory renames
// retain their existing destination check.
func movePath(from, to string) error {
	return movePathWithOps(from, to, os.Link, os.Remove)
}

// The operations are injectable to exercise filesystem failures deterministically.
func movePathWithOps(from, to string, link func(string, string) error, remove func(string) error) error {
	info, err := os.Lstat(from)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if _, err := os.Lstat(to); err == nil {
			return fmt.Errorf("%w: %s", ErrNameTaken, to)
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return os.Rename(from, to)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("cannot move non-regular file: %s", from)
	}
	if err := link(from, to); err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("%w: %s", ErrNameTaken, to)
		}
		// Some filesystems report EPERM when hard links are unsupported.
		if !errors.Is(err, syscall.EXDEV) && !errors.Is(err, syscall.ENOSYS) && !errors.Is(err, syscall.EOPNOTSUPP) && !errors.Is(err, syscall.EPERM) {
			return err
		}
		return copyMove(from, to, info.Mode(), remove)
	}
	if err := remove(from); err != nil {
		return cleanupMoveDestination(to, fmt.Errorf("remove source %s: %w", from, err), remove)
	}
	return nil
}

func cleanupMoveDestination(to string, cause error, remove func(string) error) error {
	if err := remove(to); err != nil {
		return errors.Join(cause, fmt.Errorf("remove destination %s: %w", to, err))
	}
	return cause
}

func copyMove(from, to string, mode os.FileMode, remove func(string) error) error {
	src, err := os.Open(from)
	if err != nil {
		return err
	}
	dst, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		closeErr := src.Close()
		if errors.Is(err, os.ErrExist) {
			err = fmt.Errorf("%w: %s", ErrNameTaken, to)
		}
		return errors.Join(err, closeErr)
	}
	_, copyErr := io.Copy(dst, src)
	var syncErr error
	if copyErr == nil {
		syncErr = dst.Sync()
	}
	err = errors.Join(copyErr, syncErr, dst.Close(), src.Close())
	if err != nil {
		return cleanupMoveDestination(to, fmt.Errorf("copy %s to %s: %w", from, to, err), remove)
	}
	if err := remove(from); err != nil {
		return cleanupMoveDestination(to, fmt.Errorf("remove source %s: %w", from, err), remove)
	}
	return nil
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func pruneEmpty(dir string, stopAt string) {
	for dir != stopAt && dir != string(filepath.Separator) && dir != "." {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			return
		}
		if err := os.Remove(dir); err != nil {
			return
		}
		dir = filepath.Dir(dir)
	}
}

// RenameAlbum renames an album and the folder holding it under every root.
func RenameAlbum(app core.App, albumID, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return errors.New("the name cannot be empty")
	}

	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	if album.GetString("name") == newName {
		return nil
	}

	artist := albumArtistName(app, album)
	moves := planned(albumMoves(app, artist, AlbumDirectoryName(album), artist, albumDirectoryName(album, newName)))
	if err := checkDestinations(moves); err != nil {
		return err
	}
	if err := applyMoves(moves); err != nil {
		return err
	}

	album.Set("name", newName)
	if err := app.Save(album); err != nil {
		return errors.Join(err, undoMoves(moves))
	}

	return nil
}

// RenameArtist renames an artist and the folder holding all of its albums.
func RenameArtist(app core.App, artistID, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return errors.New("the name cannot be empty")
	}

	artist, err := app.FindRecordById("artists", artistID)
	if err != nil {
		return err
	}
	oldName := artist.GetString("name")
	if oldName == newName {
		return nil
	}

	var moves []move
	for _, root := range localRoots(app) {
		if root == "" {
			continue
		}
		moves = append(moves, move{
			from: filepath.Join(root, sanitizeFilename(oldName)),
			to:   filepath.Join(root, sanitizeFilename(newName)),
		})
	}

	moves = planned(moves)
	if err := checkDestinations(moves); err != nil {
		return err
	}
	if err := applyMoves(moves); err != nil {
		return err
	}

	artist.Set("name", newName)
	if err := app.Save(artist); err != nil {
		return errors.Join(err, undoMoves(moves))
	}

	return nil
}

// ReattachAlbum makes an album the work of another artist, folder included.
func ReattachAlbum(app core.App, albumID, artistID string) error {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	artist, err := app.FindRecordById("artists", artistID)
	if err != nil {
		return err
	}

	credits := album.GetStringSlice("artists")
	if len(credits) > 0 && credits[0] == artist.Id {
		return nil
	}

	from := albumArtistName(app, album)
	to := artist.GetString("name")
	name := AlbumDirectoryName(album)

	var moves []move
	if from != to {
		moves = planned(albumMoves(app, from, name, to, name))
		if err := checkDestinations(moves); err != nil {
			return err
		}
		if err := applyMoves(moves); err != nil {
			return err
		}
	}

	credited := []string{artist.Id}
	for _, id := range credits {
		if id != artist.Id {
			credited = append(credited, id)
		}
	}
	album.Set("artists", credited)
	if err := app.Save(album); err != nil {
		return errors.Join(err, undoMoves(moves))
	}

	for _, m := range moves {
		pruneEmpty(filepath.Dir(m.from), rootOf(app, m.from))
	}

	return nil
}

func albumMoves(app core.App, fromArtist, fromAlbum, toArtist, toAlbum string) []move {
	var moves []move
	for _, root := range localRoots(app) {
		if root == "" {
			continue
		}
		moves = append(moves, move{
			from: filepath.Join(root, sanitizeFilename(fromArtist), fromAlbum),
			to:   filepath.Join(root, sanitizeFilename(toArtist), toAlbum),
		})
	}

	return moves
}

func rootOf(app core.App, path string) string {
	for _, root := range localRoots(app) {
		if root != "" && strings.HasPrefix(path, root) {
			return root
		}
	}

	return ""
}

func albumArtistName(app core.App, album *core.Record) string {
	ids := album.GetStringSlice("artists")
	if len(ids) == 0 {
		return "Unknown Artist"
	}
	artist, err := app.FindRecordById("artists", ids[0])
	if err != nil {
		return "Unknown Artist"
	}

	return artist.GetString("name")
}
