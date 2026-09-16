package watcher

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSettledWaitsForTheWriterToFinish(t *testing.T) {
	path := filepath.Join(t.TempDir(), "copying.mp3")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}

	const chunks = 5
	block := make([]byte, 4096)
	done := make(chan int64)
	go func() {
		written := int64(0)
		for range chunks {
			n, _ := f.Write(block)
			written += int64(n)
			_ = f.Sync()
			time.Sleep(400 * time.Millisecond)
		}
		_ = f.Close()
		done <- written
	}()

	if !settled(path) {
		t.Fatal("settled reported the file never stopped changing")
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	atAnswer := info.Size()

	if final := <-done; atAnswer != final {
		t.Errorf("settled returned at %d bytes, the writer finished at %d", atAnswer, final)
	}
}

func TestSettledGivesUpOnAFileThatVanishes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gone.mp3")
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}

	start := time.Now()
	if settled(path) {
		t.Error("a file that is not there settled")
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("waited %v for a file that was already gone", elapsed)
	}
}

func TestSettledDoesNotAcceptAnEmptyFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "empty.mp3")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	_ = f.Close()

	answered := make(chan bool, 1)
	go func() { answered <- settled(path) }()

	select {
	case got := <-answered:
		t.Errorf("settled returned %v for a file with nothing in it", got)
	case <-time.After(settleInterval * (settleRounds + 2)):
	}
}
