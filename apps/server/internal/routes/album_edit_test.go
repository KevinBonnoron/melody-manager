package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestInvalidAlbumTypeDoesNotRenameTheAlbum(t *testing.T) {
	pb, handler := usersTestHandler(t)
	artists := core.NewBaseCollection("artists")
	artists.Fields.Add(&core.TextField{Name: "name", Required: true})
	if err := pb.Save(artists); err != nil {
		t.Fatal(err)
	}
	albums := core.NewBaseCollection("albums")
	albums.Fields.Add(&core.TextField{Name: "name", Required: true}, &core.RelationField{Name: "artists", CollectionId: artists.Id, MaxSelect: 10})
	if err := pb.Save(albums); err != nil {
		t.Fatal(err)
	}
	artist := core.NewRecord(artists)
	artist.Set("name", "Artist")
	if err := pb.Save(artist); err != nil {
		t.Fatal(err)
	}
	album := core.NewRecord(albums)
	album.Set("name", "Original")
	album.Set("artists", []string{artist.Id})
	if err := pb.Save(album); err != nil {
		t.Fatal(err)
	}

	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")
	req := httptest.NewRequest(http.MethodPatch, "/api/albums/"+album.Id, strings.NewReader(`{"name":"Changed","type":"invalid"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
	fresh, err := pb.FindRecordById("albums", album.Id)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.GetString("name") != "Original" {
		t.Fatalf("rejected edit changed the name to %q", fresh.GetString("name"))
	}
}
