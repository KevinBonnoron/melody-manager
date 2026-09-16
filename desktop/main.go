// Command melody-manager-desktop is the desktop client: the same web client as everywhere else,
// in a native window, talking to a Melody Manager server over the network.
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

//go:embed all:frontend
var embedded embed.FS

const appIconPath = "pwa-512x512.png"

func main() {
	assets, err := fs.Sub(embedded, "frontend/dist")
	if err != nil {
		log.Fatalf("desktop client: no bundle embedded, run `task desktop`: %v", err)
	}

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

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Melody Manager",
		Width:            1280,
		Height:           860,
		MinWidth:         420,
		MinHeight:        560,
		BackgroundColour: application.NewRGB(10, 10, 18),
		Linux:            application.LinuxWindow{Icon: icon},
	})

	if err = app.Run(); err != nil {
		log.Fatalf("desktop client: %v", err)
	}
}

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
