package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
			undoMoves(done)
			return err
		}
		if err := os.Rename(m.from, m.to); err != nil {
			undoMoves(done)
			return err
		}
		done = append(done, m)
	}

	return nil
}

func undoMoves(done []move) {
	for i := len(done) - 1; i >= 0; i-- {
		_ = os.Rename(done[i].to, done[i].from)
	}
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func exists(path string) bool {
	_, err := os.Stat(path)
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
	moves := planned(albumMoves(app, artist, album.GetString("name"), artist, newName))
	if err := checkDestinations(moves); err != nil {
		return err
	}
	if err := applyMoves(moves); err != nil {
		return err
	}

	album.Set("name", newName)
	if err := app.Save(album); err != nil {
		undoMoves(moves)
		return err
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
		undoMoves(moves)
		return err
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
	name := album.GetString("name")

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
		undoMoves(moves)
		return err
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
			from: filepath.Join(root, sanitizeFilename(fromArtist), sanitizeFilename(fromAlbum)),
			to:   filepath.Join(root, sanitizeFilename(toArtist), sanitizeFilename(toAlbum)),
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
