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

	// And the refusal has to be worth something: nothing moved.
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
		// Nothing to move: os.Rename fails, and the first move has to come back.
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
