package cache

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// producer writes a file of the given size in a temp dir, the way yt-dlp does,
// and counts how many times it ran.
func producer(t *testing.T, size int, calls *int32, mu *sync.Mutex) func(context.Context) (string, error) {
	t.Helper()
	tmp := t.TempDir()
	var n int
	return func(context.Context) (string, error) {
		mu.Lock()
		n++
		*calls = int32(n)
		mu.Unlock()
		f, err := os.CreateTemp(tmp, "produced-*.m4a")
		if err != nil {
			return "", err
		}
		if _, err := f.Write(make([]byte, size)); err != nil {
			return "", err
		}
		return f.Name(), f.Close()
	}
}

func TestFetchCachesAcrossCalls(t *testing.T) {
	c, err := New(t.TempDir(), 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	produce := producer(t, 128, &calls, &mu)

	first, err := c.Fetch(context.Background(), "https://example/track", produce)
	if err != nil {
		t.Fatal(err)
	}
	second, err := c.Fetch(context.Background(), "https://example/track", produce)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Errorf("second fetch returned %q, want the cached %q", second, first)
	}
	if calls != 1 {
		t.Errorf("producer ran %d times, want 1", calls)
	}
	if !strings.HasPrefix(first, c.Dir()) {
		t.Errorf("cached file %q is not inside %q", first, c.Dir())
	}
	if _, err := os.Stat(first); err != nil {
		t.Errorf("cached file missing: %v", err)
	}
}

func TestFetchDoesNotCacheAFailedProducer(t *testing.T) {
	c, err := New(t.TempDir(), 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	boom := errors.New("download failed")
	if _, err := c.Fetch(context.Background(), "k", func(context.Context) (string, error) {
		return "", boom
	}); !errors.Is(err, boom) {
		t.Fatalf("got %v, want %v", err, boom)
	}
	if c.Len() != 0 {
		t.Errorf("cache holds %d entries after a failure, want 0", c.Len())
	}
}

func TestEvictsByFileCount(t *testing.T) {
	c, err := New(t.TempDir(), 2, 1<<30)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	for _, k := range []string{"a", "b", "c"} {
		if _, err := c.Fetch(context.Background(), k, producer(t, 16, &calls, &mu)); err != nil {
			t.Fatal(err)
		}
	}
	if c.Len() != 2 {
		t.Errorf("cache holds %d files, want 2", c.Len())
	}
	// "a" was the least recently used, so it is the one that went.
	if _, ok := c.get("a"); ok {
		t.Error("the oldest entry survived eviction")
	}
	if _, ok := c.get("c"); !ok {
		t.Error("the newest entry was evicted")
	}
}

func TestEvictsByTotalSize(t *testing.T) {
	c, err := New(t.TempDir(), 100, 300)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	for _, k := range []string{"a", "b", "c"} {
		if _, err := c.Fetch(context.Background(), k, producer(t, 200, &calls, &mu)); err != nil {
			t.Fatal(err)
		}
	}
	if c.Size() > 300 {
		t.Errorf("cache holds %d bytes, want at most 300", c.Size())
	}
	files, _ := os.ReadDir(c.Dir())
	if len(files) != c.Len() {
		t.Errorf("%d files on disk but %d entries indexed", len(files), c.Len())
	}
}

func TestSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	c, err := New(dir, 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	want, err := c.Fetch(context.Background(), "https://example/track", producer(t, 64, &calls, &mu))
	if err != nil {
		t.Fatal(err)
	}

	// A restart must adopt what is already on disk rather than re-download.
	reopened, err := New(dir, 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	got, err := reopened.Fetch(context.Background(), "https://example/track", func(context.Context) (string, error) {
		t.Error("producer ran after a restart; the cached file was not adopted")
		return "", errors.New("should not run")
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("after restart got %q, want %q", got, want)
	}
}

func TestConcurrentFetchesProduceOnce(t *testing.T) {
	c, err := New(t.TempDir(), 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	produce := producer(t, 32, &calls, &mu)

	var wg sync.WaitGroup
	paths := make([]string, 8)
	for i := range paths {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			p, err := c.Fetch(context.Background(), "same", produce)
			if err != nil {
				t.Error(err)
				return
			}
			paths[i] = p
		}(i)
	}
	wg.Wait()

	if calls != 1 {
		t.Errorf("producer ran %d times for 8 concurrent fetches, want 1", calls)
	}
	for _, p := range paths {
		if p != paths[0] {
			t.Fatalf("concurrent fetches disagreed: %q vs %q", p, paths[0])
		}
	}
}

func TestServingIsRefusedWhenTheFileVanishes(t *testing.T) {
	c, err := New(t.TempDir(), 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	path, err := c.Fetch(context.Background(), "k", producer(t, 16, &calls, &mu))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.get("k"); ok {
		t.Error("cache served an entry whose file was deleted behind its back")
	}
	if c.Len() != 0 {
		t.Errorf("stale entry left indexed: %d", c.Len())
	}
	_ = filepath.Base(path)
}

func TestForgetDropsTheEntryAndItsFile(t *testing.T) {
	c, err := New(t.TempDir(), 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	var calls int32
	var mu sync.Mutex
	path, err := c.Fetch(context.Background(), "k", producer(t, 32, &calls, &mu))
	if err != nil {
		t.Fatal(err)
	}

	c.Forget("k")

	if c.Len() != 0 {
		t.Errorf("cache still holds %d entries", c.Len())
	}
	if c.Size() != 0 {
		t.Errorf("cache still accounts for %d bytes", c.Size())
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("the file was left behind: %v", err)
	}
	// Forgetting something that was never cached must be harmless.
	c.Forget("never-stored")
}
