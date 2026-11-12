package services

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func mkdirs(t *testing.T, paths ...string) {
	t.Helper()
	for _, p := range paths {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
	}
}

func writeFile(t *testing.T, path string) {
	t.Helper()
	mkdirs(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPlannedSkipsWhatIsNotThere(t *testing.T) {
	root := t.TempDir()
	here := filepath.Join(root, "here")
	mkdirs(t, here)

	got := planned([]move{
		{from: here, to: filepath.Join(root, "moved")},
		{from: filepath.Join(root, "absent"), to: filepath.Join(root, "elsewhere")},
		{from: here, to: here},
	})

	if len(got) != 1 || got[0].from != here {
		t.Fatalf("got %+v", got)
	}
}

func TestCheckDestinationsRefusesATakenName(t *testing.T) {
	root := t.TempDir()
	mkdirs(t, filepath.Join(root, "a"), filepath.Join(root, "b"))

	err := checkDestinations([]move{{from: filepath.Join(root, "a"), to: filepath.Join(root, "b")}})
	if !errors.Is(err, ErrNameTaken) {
		t.Fatalf("got %v, want ErrNameTaken", err)
	}

	if !isDir(filepath.Join(root, "a")) || !isDir(filepath.Join(root, "b")) {
		t.Fatal("a destination check moved something")
	}
}

func TestApplyMovesRenamesEveryRoot(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "one", "Old", "track.flac"))
	writeFile(t, filepath.Join(root, "two", "Old", "track.flac"))

	moves := []move{
		{from: filepath.Join(root, "one", "Old"), to: filepath.Join(root, "one", "New")},
		{from: filepath.Join(root, "two", "Old"), to: filepath.Join(root, "two", "New")},
	}
	if err := applyMoves(moves); err != nil {
		t.Fatal(err)
	}

	for _, dir := range []string{"one", "two"} {
		if !exists(filepath.Join(root, dir, "New", "track.flac")) {
			t.Fatalf("%s was not renamed", dir)
		}
		if exists(filepath.Join(root, dir, "Old")) {
			t.Fatalf("%s kept its old name", dir)
		}
	}
}

func TestApplyMovesUndoesWhatItAlreadyDidWhenOneFails(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "one", "Old", "track.flac"))

	moves := []move{
		{from: filepath.Join(root, "one", "Old"), to: filepath.Join(root, "one", "New")},
		{from: filepath.Join(root, "two", "Missing"), to: filepath.Join(root, "two", "New")},
	}
	if err := applyMoves(moves); err == nil {
		t.Fatal("expected the batch to fail")
	}

	if !exists(filepath.Join(root, "one", "Old", "track.flac")) {
		t.Fatal("the first move was not undone")
	}
	if exists(filepath.Join(root, "one", "New")) {
		t.Fatal("the first move is still applied")
	}
}

func TestApplyMovesCreatesTheDestinationParent(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "Old Artist", "Album", "track.flac"))

	moves := []move{{
		from: filepath.Join(root, "Old Artist", "Album"),
		to:   filepath.Join(root, "New Artist", "Album"),
	}}
	if err := applyMoves(moves); err != nil {
		t.Fatal(err)
	}
	if !exists(filepath.Join(root, "New Artist", "Album", "track.flac")) {
		t.Fatal("the album did not land under the new artist")
	}
}

func TestApplyMovesFileCollisionRollsBack(t *testing.T) {
	root := t.TempDir()
	first := filepath.Join(root, "first")
	second := filepath.Join(root, "second")
	firstDest := filepath.Join(root, "new", "first")
	secondDest := filepath.Join(root, "new", "second")
	writeFile(t, first)
	writeFile(t, second)
	mkdirs(t, filepath.Dir(secondDest))
	if err := os.WriteFile(secondDest, []byte("existing"), 0o644); err != nil {
		t.Fatal(err)
	}
	err := applyMoves([]move{{from: first, to: firstDest}, {from: second, to: secondDest}})
	if !errors.Is(err, ErrNameTaken) {
		t.Fatalf("got %v, want ErrNameTaken", err)
	}
	if !exists(first) || exists(firstDest) || !exists(second) {
		t.Fatal("failed batch did not preserve the source files")
	}
	data, err := os.ReadFile(secondDest)
	if err != nil || string(data) != "existing" {
		t.Fatalf("destination changed: %q, %v", data, err)
	}
}

func TestUndoMovesDoesNotOverwriteRecreatedSource(t *testing.T) {
	root := t.TempDir()
	for _, directory := range []bool{false, true} {
		name := "file"
		if directory {
			name = "directory"
		}
		t.Run(name, func(t *testing.T) {
			from := filepath.Join(root, name, "old")
			to := filepath.Join(root, name, "new")
			if directory {
				writeFile(t, filepath.Join(from, "track"))
			} else {
				writeFile(t, from)
			}
			m := move{from: from, to: to}
			if err := applyMoves([]move{m}); err != nil {
				t.Fatal(err)
			}
			if directory {
				mkdirs(t, from)
			} else if err := os.WriteFile(from, []byte("replacement"), 0o644); err != nil {
				t.Fatal(err)
			}
			undoMoves([]move{m})
			if !exists(from) || !exists(to) {
				t.Fatal("rollback overwrote the recreated source or removed the moved data")
			}
			if !directory {
				data, err := os.ReadFile(from)
				if err != nil || string(data) != "replacement" {
					t.Fatalf("source changed: %q, %v", data, err)
				}
			}
		})
	}
}

func TestApplyMovesConcurrentDestinationCreation(t *testing.T) {
	root := t.TempDir()
	from := filepath.Join(root, "source")
	to := filepath.Join(root, "destination")
	writeFile(t, from)
	start := make(chan struct{})
	created := make(chan error, 1)
	go func() {
		<-start
		f, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err == nil {
			_, err = f.WriteString("competitor")
			if closeErr := f.Close(); err == nil {
				err = closeErr
			}
		}
		created <- err
	}()
	close(start)
	moveErr := applyMoves([]move{{from: from, to: to}})
	createErr := <-created
	data, err := os.ReadFile(to)
	if err != nil {
		t.Fatal(err)
	}
	if moveErr == nil {
		if !errors.Is(createErr, os.ErrExist) || string(data) != "x" || exists(from) {
			t.Fatalf("move won but destination changed: create=%v data=%q", createErr, data)
		}
	} else if !errors.Is(moveErr, ErrNameTaken) || createErr != nil || string(data) != "competitor" || !exists(from) {
		t.Fatalf("creator won but files changed: move=%v create=%v data=%q", moveErr, createErr, data)
	}
}

func TestRenameVideoAlbumKeepsItsDirectoryIdentity(t *testing.T) {
	f := newRegroupFixture(t)
	album := f.album("Old")
	album.Set("videoOrigin", "https://example.com/video")
	f.save(album)
	oldPath := filepath.Join(f.root, "Channel", AlbumDirectoryName(album), "track.flac")
	writeFile(t, oldPath)
	if err := RenameAlbum(f.app, album.Id, "New"); err != nil {
		t.Fatal(err)
	}
	newPath := filepath.Join(f.root, "Channel", albumDirectoryName(album, "New"), "track.flac")
	if exists(oldPath) || !exists(newPath) {
		t.Fatalf("video album not moved from %q to %q", oldPath, newPath)
	}
}

func TestPruneEmptyStopsAtTheRootAndAtWhatIsUsed(t *testing.T) {
	root := t.TempDir()
	empty := filepath.Join(root, "Empty Artist", "Gone")
	mkdirs(t, empty)
	writeFile(t, filepath.Join(root, "Busy Artist", "Kept", "track.flac"))

	pruneEmpty(empty, root)
	if exists(filepath.Join(root, "Empty Artist")) {
		t.Fatal("an artist left with nothing should go")
	}
	if !isDir(root) {
		t.Fatal("the root itself must survive")
	}

	pruneEmpty(filepath.Join(root, "Busy Artist", "Kept"), root)
	if !exists(filepath.Join(root, "Busy Artist", "Kept", "track.flac")) {
		t.Fatal("a folder with something in it must survive")
	}
}
