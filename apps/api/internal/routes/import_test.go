package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

func importTestHandler(t *testing.T) (*tests.TestApp, http.Handler, *tasks.Service) {
	t.Helper()
	pb, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pb.Cleanup() })
	user, err := pb.FindAuthRecordByEmail("users", "test@example.com")
	if err != nil {
		t.Fatal(err)
	}
	// The fixture enables MFA; this test exercises the import guard, not the
	// second-factor challenge that intentionally precedes it.
	user.Collection().MFA.Enabled = false
	if err := pb.Save(user.Collection()); err != nil {
		t.Fatal(err)
	}
	ensureUserSessions(t, pb, user)
	RegisterAuthSessions(pb)
	router, err := apis.NewRouter(pb)
	if err != nil {
		t.Fatal(err)
	}
	deps := &app.Deps{Devices: devices.New(func() string { return "" }), Tasks: tasks.New()}
	Register(&core.ServeEvent{App: pb, Router: router}, deps)
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return pb, handler, deps.Tasks
}

func importAddRequest(t *testing.T, handler http.Handler, token, url string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/tracks/add", strings.NewReader(`{"url":`+strconvQuote(url)+`}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func TestImportAddRefusesUnusableProvider(t *testing.T) {
	_, handler, taskService := importTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	// Bandcamp is a personal source the test user has not connected (and has not
	// enabled server-wide), so its URL must be refused before any task exists.
	response := importAddRequest(t, handler, token, "https://artist.bandcamp.com/track/song")
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
	// PocketBase capitalizes and punctuates error messages, so the word the API
	// chose is matched loosely.
	if !strings.Contains(strings.ToLower(response.Body.String()), "providerunavailable") {
		t.Fatalf("expected providerUnavailable error, got: %s", response.Body.String())
	}
	if listed := taskService.List(); len(listed) != 0 {
		t.Fatalf("expected no import task, got %d", len(listed))
	}
}

func TestImportAddCreatesTaskForUnknownProvider(t *testing.T) {
	_, handler, taskService := importTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	// A URL no provider claims passes the usability guard; the task it starts
	// fails on its own, which is what keeps a 202 here rather than a 403.
	response := importAddRequest(t, handler, token, "https://example.com/no-provider-here")
	if response.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", response.Code, response.Body.String())
	}
	if listed := taskService.List(); len(listed) != 1 {
		t.Fatalf("expected one import task, got %d", len(listed))
	}
}
