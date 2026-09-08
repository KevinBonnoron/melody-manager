// Package watcher syncs the local provider directory into the library in real
// time (the Go counterpart of the old chokidar-based watcher).
package watcher

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/services"
)

// Start watches the local provider's configured directory (recursively) and
// imports/removes tracks as files appear/disappear.
//
// The path is polled rather than read once: a fresh install seeds the local
// provider with an empty config, so reading it at boot would leave the watcher
// permanently off until someone restarted the server after setting the
// directory. Re-reading also picks up a changed path.
func Start(app core.App) {
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
			}
		}
		time.Sleep(configPollInterval)
	}
}

const configPollInterval = 30 * time.Second

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
		// Defer slightly so the file is fully written before we probe it.
		go func(path string) {
			time.Sleep(time.Second)
			_ = services.ImportLocalPath(context.Background(), app, path)
		}(ev.Name)
	case ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0:
		services.RemoveLocalByPath(app, ev.Name)
	}
}

func addTree(w *fsnotify.Watcher, root string) {
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			_ = w.Add(path)
		}
		return nil
	})
}
