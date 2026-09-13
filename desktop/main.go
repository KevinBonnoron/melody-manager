// Command melody-manager-desktop is the desktop client: the same web client as
// everywhere else, in a native window, talking to a Melody Manager server over
// the network. It embeds no server of its own, exactly like the Android build,
// and is the only place in the repository that knows Wails exists.
package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The whole folder, not the bundle inside it: the bundle is wiped and rewritten
// on every build, so embedding it directly would leave a fresh clone unable to
// compile until someone had built the client first.
//
//go:embed all:frontend
var embedded embed.FS

// Shipped by the client for its web manifest, at a size every desktop wants.
const appIconPath = "pwa-512x512.png"

func main() {
	assets, err := fs.Sub(embedded, "frontend/dist")
	if err != nil {
		log.Fatalf("desktop client: no bundle embedded, run `task desktop`: %v", err)
	}

	// The bundle already carries the application's icon for the web manifest,
	// so the window and the about box use that one rather than a second copy
	// kept in step by hand. A build without it simply has no icon.
	icon, iconErr := fs.ReadFile(assets, appIconPath)
	if iconErr != nil {
		log.Printf("desktop client: no icon in the bundle (%s): %v", appIconPath, iconErr)
	}

	app := application.New(application.Options{
		Name:        "Melody Manager",
		Description: "Desktop client for a Melody Manager server",
		Icon:        icon,
		Assets: application.AssetOptions{
			Handler: singlePageHandler(assets),
		},
	})

	// Through the application, not the package-level constructor: that one
	// builds the window without registering it, so it is never shown.
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Melody Manager",
		Width:  1280,
		Height: 860,
		// Below this the client folds to its phone layout, which is not what a
		// window should do because someone dragged its corner.
		MinWidth:  420,
		MinHeight: 560,
		// The client paints its own background, but the window exists for a
		// moment before it does: white there would flash on every launch.
		BackgroundColour: application.NewRGB(10, 10, 18),
		// The window icon is per platform: this one is what a Linux desktop
		// shows for a minimised window.
		Linux: application.LinuxWindow{Icon: icon},
	})

	if err = app.Run(); err != nil {
		log.Fatalf("desktop client: %v", err)
	}
}

// singlePageHandler serves the bundle, and the shell for everything else.
//
// The client does its own routing, so a path like /login is not a file: asked
// for it, a plain file server answers 404 and the window shows a blank page.
// Anything that is not an asset gets index.html, and the router takes over from
// there.
func singlePageHandler(assets fs.FS) http.Handler {
	files := application.AssetFileServerFS(assets)
	shell := shellDocument(assets)
	serveShell := func(w http.ResponseWriter, r *http.Request) {
		if shell == nil {
			r = r.Clone(r.Context())
			r.URL.Path = "/"
			files.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(shell)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" || name == "." || name == "index.html" {
			serveShell(w, r)
			return
		}

		if _, err := fs.Stat(assets, name); err != nil {
			serveShell(w, r)
			return
		}

		files.ServeHTTP(w, r)
	})
}

// The webview has no way to ask what machine it runs on, and a user agent there
// names the embedded engine, which on Linux calls itself Safari. The host does
// know, so it writes the name into the document it serves.
func shellDocument(assets fs.FS) []byte {
	document, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		log.Printf("desktop client: no index.html in the bundle: %v", err)
		return nil
	}

	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		return document
	}

	name, err := json.Marshal(host)
	if err != nil {
		return document
	}

	head := []byte("<head>")
	at := bytes.Index(document, head)
	if at < 0 {
		return document
	}

	injected := []byte("<script>window.__MELODY_HOST__=" + string(name) + "</script>")
	return append(document[:at+len(head)], append(injected, document[at+len(head):]...)...)
}
