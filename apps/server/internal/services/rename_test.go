package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
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
			err := undoMoves([]move{m})
			if !errors.Is(err, ErrNameTaken) || !strings.Contains(err.Error(), from) || !strings.Contains(err.Error(), to) {
				t.Fatalf("rollback error lacks collision or paths: %v", err)
			}
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

func TestMovePathUnlinkFailureCleansDestination(t *testing.T) {
	for _, cleanupFails := range []bool{false, true} {
		t.Run(fmt.Sprint(cleanupFails), func(t *testing.T) {
			root := t.TempDir()
			from, to := filepath.Join(root, "source"), filepath.Join(root, "destination")
			writeFile(t, from)
			unlinkErr := errors.New("unlink source failed")
			cleanupErr := errors.New("cleanup failed")
			remove := func(path string) error {
				if path == from {
					return unlinkErr
				}
				if cleanupFails {
					return cleanupErr
				}
				return os.Remove(path)
			}
			err := movePathWithOps(from, to, os.Link, remove)
			if !errors.Is(err, unlinkErr) || !strings.Contains(err.Error(), from) {
				t.Fatalf("missing source error and path: %v", err)
			}
			if errors.Is(err, cleanupErr) != cleanupFails || (cleanupFails && !strings.Contains(err.Error(), to)) {
				t.Fatalf("incorrect cleanup error: %v", err)
			}
			if !exists(from) || exists(to) != cleanupFails {
				t.Fatal("unexpected files after failed unlink")
			}
		})
	}
}

func TestMovePathCopyFallback(t *testing.T) {
	for _, collision := range []bool{false, true} {
		t.Run(fmt.Sprint(collision), func(t *testing.T) {
			root := t.TempDir()
			from, to := filepath.Join(root, "source"), filepath.Join(root, "destination")
			writeFile(t, from)
			if collision {
				if err := os.WriteFile(to, []byte("existing"), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			err := movePathWithOps(from, to, func(string, string) error { return syscall.EXDEV }, os.Remove)
			if collision {
				if !errors.Is(err, ErrNameTaken) || !exists(from) {
					t.Fatalf("collision did not preserve source: %v", err)
				}
			} else if err != nil || exists(from) {
				t.Fatalf("fallback failed: %v", err)
			}
			data, readErr := os.ReadFile(to)
			want := "x"
			if collision {
				want = "existing"
			}
			if readErr != nil || string(data) != want {
				t.Fatalf("destination = %q, %v; want %q", data, readErr, want)
			}
		})
	}
}

func TestMovePathDoesNotCopyOnLinkPermissionError(t *testing.T) {
	root := t.TempDir()
	from, to := filepath.Join(root, "source"), filepath.Join(root, "destination")
	writeFile(t, from)
	err := movePathWithOps(from, to, func(string, string) error { return syscall.EACCES }, os.Remove)
	if !errors.Is(err, syscall.EACCES) || !exists(from) || exists(to) {
		t.Fatalf("permission error should not trigger copying: %v", err)
	}
}

func TestMovePathCopyFallbackOnUnsupportedLinkPermission(t *testing.T) {
	root := t.TempDir()
	from, to := filepath.Join(root, "source"), filepath.Join(root, "destination")
	writeFile(t, from)
	err := movePathWithOps(from, to, func(string, string) error { return syscall.EPERM }, os.Remove)
	if err != nil || exists(from) {
		t.Fatalf("fallback failed: %v", err)
	}
	data, err := os.ReadFile(to)
	if err != nil || string(data) != "x" {
		t.Fatalf("destination = %q, %v", data, err)
	}
}

func TestMovePathCopyFallbackUnlinkFailure(t *testing.T) {
	root := t.TempDir()
	from, to := filepath.Join(root, "source"), filepath.Join(root, "destination")
	writeFile(t, from)
	unlinkErr := errors.New("unlink failed")
	err := movePathWithOps(from, to, func(string, string) error { return syscall.EXDEV }, func(path string) error {
		if path == from {
			return unlinkErr
		}
		return os.Remove(path)
	})
	if !errors.Is(err, unlinkErr) || !exists(from) || exists(to) {
		t.Fatalf("failed copy move did not preserve source: %v", err)
	}
}

func TestUndoMovesReportsEveryFailure(t *testing.T) {
	root := t.TempDir()
	moves := []move{
		{from: filepath.Join(root, "old1"), to: filepath.Join(root, "new1")},
		{from: filepath.Join(root, "old2"), to: filepath.Join(root, "new2")},
	}
	for _, m := range moves {
		writeFile(t, m.to)
		writeFile(t, m.from)
	}
	err := undoMoves(moves)
	if !errors.Is(err, ErrNameTaken) {
		t.Fatalf("missing collision error: %v", err)
	}
	for _, m := range moves {
		if !strings.Contains(err.Error(), m.from) || !strings.Contains(err.Error(), m.to) {
			t.Fatalf("missing rollback paths: %v", err)
		}
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
