package services

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

func TestLegacyCoverDeadlineDoesNotPreventCompletingTheSplit(t *testing.T) {
	f := newRegroupFixture(t)
	albums, err := f.app.FindCollectionByNameOrId("albums")
	if err != nil {
		t.Fatal(err)
	}
	albums.Fields.Add(&core.FileField{Name: "cover", MaxSelect: 1})
	if err := f.app.Save(albums); err != nil {
		t.Fatal(err)
	}
	var imageBytes bytes.Buffer
	if err := png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(imageBytes.Bytes())
			return
		}
		<-r.Context().Done()
	}))
	defer server.Close()

	legacy := f.album("Channel - youtube")
	for _, title := range []string{"First", "Second", "Third"} {
		f.track(legacy, title, map[string]any{"coverArtUrl": server.URL + "/cover.png"})
	}
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	if err := splitLegacyYouTubeAlbums(ctx, f.app, 500*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if ctx.Err() != nil {
		t.Fatal("cover fetches exhausted the parent deadline rather than the shared cover budget")
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("cover requests = %d, want a successful request followed by one cancelled request", got)
	}
	if len(f.albumsNamed("Channel - youtube")) != 0 {
		t.Fatal("cover deadline prevented finishing the album split")
	}
	covered := 0
	for _, title := range []string{"First", "Second", "Third"} {
		releases := f.albumsNamed(title)
		if len(releases) != 1 || !f.file(AlbumDirectoryName(releases[0]), title) {
			t.Fatalf("cover deadline prevented moving %q", title)
		}
		if releases[0].GetString("cover") != "" {
			covered++
		}
	}
	if covered != 1 {
		t.Fatalf("saved covers = %d, want the first successful cover to be retained", covered)
	}
}
