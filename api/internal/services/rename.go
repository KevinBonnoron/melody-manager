package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// ErrNameTaken is returned when a rename would land on a directory that is
// already someone else's. Nothing has been moved when it is returned.
var ErrNameTaken = errors.New("a folder of that name already exists")

// move is one directory to be renamed on disk.
type move struct {
	from string
	to   string
}

// planned returns the moves that actually have something to move: a root the
// operator never downloaded into has no folder there, and that is not an error.
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

// checkDestinations refuses the whole batch if any destination is taken. The
// library is renamed only when every folder can follow it, so the records and
// the disk never disagree.
func checkDestinations(moves []move) error {
	for _, m := range moves {
		if exists(m.to) {
			return fmt.Errorf("%w: %s", ErrNameTaken, m.to)
		}
	}

	return nil
}

// applyMoves renames each directory, undoing the ones already done if a later
// one fails. A partial rename would leave tracks pointing at folders that no
// longer exist, which is exactly what this whole path exists to avoid.
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

// pruneEmpty removes a directory left behind by a move, and its parent if that
// one is empty too: re-attaching the last album of an artist should not leave
// the artist's folder sitting there.
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
//
// The artist it is moved to already exists, so nothing is merged and nothing is
// renamed: this is how a compilation uploaded under a channel name ends up
// where its music actually belongs.
func ReattachAlbum(app core.App, albumID, artistID string) error {
	album, err := app.FindRecordById("albums", albumID)
	if err != nil {
		return err
	}
	artist, err := app.FindRecordById("artists", artistID)
	if err != nil {
		return err
	}

	// Whether the album is already this artist's is a question about records,
	// not about names: two artists can be called the same thing, and comparing
	// the names would silently refuse to move an album between them.
	credits := album.GetStringSlice("artists")
	if len(credits) > 0 && credits[0] == artist.Id {
		return nil
	}

	from := albumArtistName(app, album)
	to := artist.GetString("name")
	name := album.GetString("name")

	// The folder is named after the artist, so two artists of the same name
	// share one. There is nothing to move, only the record to correct.
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

	// The new artist leads, the others keep their place: everyone credited on a
	// track stays credited on the album.
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
