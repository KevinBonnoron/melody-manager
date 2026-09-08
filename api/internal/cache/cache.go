// Package cache keeps audio fetched from remote sources on disk so a track is
// not re-downloaded on every play. It is the Go counterpart of the old
// server/src/services/cache.service.ts, which the first port dropped.
package cache

import (
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// TTL bounds how long an untouched entry survives, matching the old service.
const TTL = 7 * 24 * time.Hour

type entry struct {
	// key is the hashed form: it is also the file's base name, so entries
	// adopted from disk at startup index identically to freshly stored ones.
	key      string
	path     string
	size     int64
	lastUsed time.Time
}

// Cache is an LRU of files on disk, bounded by both count and total size.
type Cache struct {
	dir      string
	maxFiles int
	maxSize  int64

	mu      sync.Mutex
	entries map[string]*list.Element // hashed key -> element holding *entry
	order   *list.List               // most recently used at the front
	size    int64

	// inflight collapses concurrent misses for the same key onto one producer.
	inflight sync.Map
}

// New prepares the cache directory and adopts whatever it already holds, so a
// restart does not throw the library away.
func New(dir string, maxFiles int, maxSize int64) (*Cache, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("cache dir %s: %w", dir, err)
	}
	c := &Cache{
		dir:      dir,
		maxFiles: maxFiles,
		maxSize:  maxSize,
		entries:  make(map[string]*list.Element),
		order:    list.New(),
	}
	c.adoptExisting()
	return c, nil
}

// Fetch returns the cached file for key, producing it with produce on a miss.
// The produced file is moved into the cache and belongs to it from then on —
// callers must not delete what they get back.
func (c *Cache) Fetch(ctx context.Context, key string, produce func(context.Context) (string, error)) (string, error) {
	if path, ok := c.get(key); ok {
		return path, nil
	}

	lock, _ := c.inflight.LoadOrStore(key, &sync.Mutex{})
	mu := lock.(*sync.Mutex)
	mu.Lock()
	defer func() {
		mu.Unlock()
		c.inflight.Delete(key)
	}()

	// A concurrent producer may have finished while we waited.
	if path, ok := c.get(key); ok {
		return path, nil
	}

	produced, err := produce(ctx)
	if err != nil {
		return "", err
	}
	return c.adopt(key, produced)
}

// Dir is where the cache stores its files.
func (c *Cache) Dir() string { return c.dir }

// Len reports how many files the cache holds.
func (c *Cache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}

// Size reports the total bytes the cache holds.
func (c *Cache) Size() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.size
}

// Forget drops an entry and its file. Used when the data it held has been
// superseded — a downloaded track makes its cached extract dead weight.
func (c *Cache) Forget(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.entries[hashKey(key)]; ok {
		c.removeElement(el)
	}
}

func (c *Cache) get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.entries[hashKey(key)]
	if !ok {
		return "", false
	}
	e := el.Value.(*entry)
	if time.Since(e.lastUsed) > TTL {
		c.removeElement(el)
		return "", false
	}
	// A file removed behind our back must not be served.
	if _, err := os.Stat(e.path); err != nil {
		c.removeElement(el)
		return "", false
	}
	e.lastUsed = time.Now()
	c.order.MoveToFront(el)
	return e.path, true
}

// adopt moves a produced file into the cache under its hashed name.
func (c *Cache) adopt(key, produced string) (string, error) {
	info, err := os.Stat(produced)
	if err != nil {
		return "", err
	}
	dest := filepath.Join(c.dir, hashKey(key)+filepath.Ext(produced))
	if err := move(produced, dest); err != nil {
		return "", err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	hashed := hashKey(key)
	if el, ok := c.entries[hashed]; ok {
		c.removeElement(el)
	}
	e := &entry{key: hashed, path: dest, size: info.Size(), lastUsed: time.Now()}
	c.entries[hashed] = c.order.PushFront(e)
	c.size += e.size
	c.evictLocked()
	return dest, nil
}

func (c *Cache) evictLocked() {
	for c.order.Len() > 0 && ((c.maxFiles > 0 && c.order.Len() > c.maxFiles) || (c.maxSize > 0 && c.size > c.maxSize)) {
		c.removeElement(c.order.Back())
	}
}

func (c *Cache) removeElement(el *list.Element) {
	e := el.Value.(*entry)
	c.order.Remove(el)
	delete(c.entries, e.key)
	c.size -= e.size
	_ = os.Remove(e.path)
}

// adoptExisting rebuilds the index from the files already on disk, oldest
// first so the LRU order survives a restart.
func (c *Cache) adoptExisting() {
	files, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}
	type found struct {
		path string
		info os.FileInfo
	}
	var all []found
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		all = append(all, found{filepath.Join(c.dir, f.Name()), info})
	}
	for i := 0; i < len(all); i++ {
		for j := i + 1; j < len(all); j++ {
			if all[j].info.ModTime().Before(all[i].info.ModTime()) {
				all[i], all[j] = all[j], all[i]
			}
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, f := range all {
		hashed := keyFromFilename(f.path)
		e := &entry{key: hashed, path: f.path, size: f.info.Size(), lastUsed: f.info.ModTime()}
		c.entries[hashed] = c.order.PushFront(e)
		c.size += e.size
	}
	c.evictLocked()
}

func hashKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// keyFromFilename recovers the hashed key a cached file was stored under.
func keyFromFilename(path string) string {
	base := filepath.Base(path)
	return base[:len(base)-len(filepath.Ext(base))]
}

// move renames when it can and falls back to a copy across filesystems, which
// is the common case: yt-dlp writes to the system temp dir.
func move(src, dest string) error {
	if err := os.Rename(src, dest); err == nil {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(dest)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(dest)
		return err
	}
	_ = os.Remove(src)
	return nil
}
