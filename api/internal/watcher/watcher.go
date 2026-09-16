// Package watcher syncs the local provider directory into the library in real
// time (the Go counterpart of the old chokidar-based watcher).
package watcher

import (
	"context"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

// Start watches the local provider's configured directory (recursively) and
// imports/removes tracks as files appear/disappear.
//
// The path is polled rather than read once: a fresh install seeds the local
// provider with an empty config, so reading it at boot would leave the watcher
// permanently off until someone restarted the server after setting the
// directory. Re-reading also picks up a changed path.
func Start(app core.App, taskSvc *tasks.Service) {
	var (
		current string
		watch   *fsnotify.Watcher
		stop    chan struct{}
	)
	for {
		dir := pbx.EffectiveConfig(app, "", "local").String("path")
		if dir != current {
			if watch != nil {
				close(stop)
				_ = watch.Close()
				watch, stop = nil, nil
			}
			current = dir
			if dir != "" {
				if w, err := fsnotify.NewWatcher(); err == nil {
					addTree(w, dir)
					stop = make(chan struct{})
					watch = w
					go run(app, w, stop)
				}

				// fsnotify only reports what happens next, so the files already
				// there would stay invisible: a directory just taken up is
				// walked once. That also covers a server restarted after music
				// was dropped in while it was down.
				services.ScanLocalTask(context.Background(), app, taskSvc)
			}
		}
		waitForChange()
	}
}

const configPollInterval = 30 * time.Second

// A saved configuration should be acted on now, not on the next poll, but the
// poll stays: it is what notices a path changed straight in the database, and
// what makes a missed notification cost half a minute rather than a restart.
var configChanged = make(chan struct{}, 1)

// Nudge tells the watcher to re-read the local provider's configuration at once.
func Nudge() {
	select {
	case configChanged <- struct{}{}:
	default:
	}
}

func waitForChange() {
	timer := time.NewTimer(configPollInterval)
	defer timer.Stop()
	select {
	case <-configChanged:
	case <-timer.C:
	}
}

func run(app core.App, w *fsnotify.Watcher, stop <-chan struct{}) {
	for {
		select {
		case <-stop:
			return
		case ev, ok := <-w.Events:
			if !ok {
				return
			}
			handle(app, w, ev)
		case _, ok := <-w.Errors:
			if !ok {
				return
			}
		}
	}
}

func handle(app core.App, w *fsnotify.Watcher, ev fsnotify.Event) {
	switch {
	case ev.Op&fsnotify.Create != 0:
		if info, err := os.Stat(ev.Name); err == nil && info.IsDir() {
			addTree(w, ev.Name)
			return
		}
		go func(path string) {
			if !settled(path) {
				slog.Warn("a file that appeared never stopped changing", "path", path)
				return
			}
			if err := services.ImportLocalPath(context.Background(), app, path); err != nil {
				slog.Warn("importing a file that appeared failed", "path", path, "error", err)
			}
		}(ev.Name)
	case ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0:
		if _, err := services.SetLocalFilePresence(app, ev.Name, false); err != nil {
			slog.Warn("marking a file gone failed", "path", ev.Name, "error", err)
		}
	}
}

const (
	settleInterval = 500 * time.Millisecond
	settleRounds   = 6
	settleTimeout  = 30 * time.Minute
)

// settled waits for a file to stop growing. A create event fires when the file
// appears, not when whatever is writing it has finished, and a file imported
// mid-write keeps the duration of the fragment: the walk never reads it again.
func settled(path string) bool {
	deadline := time.Now().Add(settleTimeout)
	var last int64 = -1
	unchanged := 0
	for time.Now().Before(deadline) {
		time.Sleep(settleInterval)
		info, err := os.Stat(path)
		if err != nil {
			return false
		}

		if size := info.Size(); size != last || size == 0 {
			last, unchanged = size, 0
			continue
		}
		if unchanged++; unchanged >= settleRounds {
			return true
		}
	}
	return false
}

func addTree(w *fsnotify.Watcher, root string) {
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			_ = w.Add(path)
		}
		return nil
	})
}
