package routes

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/KevinBonnoron/melody-manager/api/internal/app"
	"github.com/KevinBonnoron/melody-manager/api/internal/devices"
	"github.com/KevinBonnoron/melody-manager/api/internal/tasks"
)

func sessionTestApp(t *testing.T) (*tests.TestApp, *core.Record) {
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
	// The fixture enables MFA; these tests exercise session authentication,
	// not the second-factor challenge that intentionally precedes it.
	user.Collection().MFA.Enabled = false
	if err := pb.Save(user.Collection()); err != nil {
		t.Fatal(err)
	}
	collection := core.NewBaseCollection(userSessionsCollection)
	collection.Fields.Add(
		&core.RelationField{Name: "user", Required: true, CollectionId: user.Collection().Id, CascadeDelete: true, MaxSelect: 1},
		&core.TextField{Name: "ipAddress", Max: 100},
		&core.TextField{Name: "userAgent", Max: 1000},
		&core.DateField{Name: "expiresAt", Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	owner := "user = @request.auth.id"
	collection.ListRule = types.Pointer(owner)
	collection.ViewRule = types.Pointer(owner)
	if err := pb.Save(collection); err != nil {
		t.Fatal(err)
	}
	RegisterAuthSessions(pb)
	return pb, user
}

func sessionHandler(t *testing.T, pb core.App) http.Handler {
	t.Helper()
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
	return handler
}

func sessionRequest(t *testing.T, handler http.Handler, method, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func sessionLogin(t *testing.T, handler http.Handler, identity, password, userAgent string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/auth-with-password", strings.NewReader(`{"identity":`+strconvQuote(identity)+`,"password":`+strconvQuote(password)+`}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("login status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Token == "" || tokenSessionID(body.Token) == "" {
		t.Fatal("login did not return a session token")
	}
	return body.Token
}

func strconvQuote(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

type testAuthSession struct {
	ID        string `json:"id"`
	UserAgent string `json:"userAgent"`
	IPAddress string `json:"ipAddress"`
	Current   bool
}

func readAuthSessions(t *testing.T, handler http.Handler, token string) []testAuthSession {
	t.Helper()
	response := sessionRequest(t, handler, http.MethodGet, "/api/collections/user_sessions/records?perPage=100", token)
	if response.Code != http.StatusOK {
		t.Fatalf("list status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Items []testAuthSession `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for i := range body.Items {
		body.Items[i].Current = body.Items[i].ID == tokenSessionID(token)
	}
	return body.Items
}

func TestSessionRevocationAffectsOnlyItsTarget(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	first := sessionLogin(t, handler, user.Email(), "1234567890", "Firefox/1.0")
	second := sessionLogin(t, handler, user.Email(), "1234567890", "Chrome/2.0")

	other := core.NewRecord(user.Collection())
	other.SetEmail("other-session@example.com")
	other.SetPassword("different-password-123")
	if err := pb.Save(other); err != nil {
		t.Fatal(err)
	}
	otherToken := sessionLogin(t, handler, other.Email(), "different-password-123", "Safari/3.0")

	sessions := readAuthSessions(t, handler, first)
	if len(sessions) != 2 {
		t.Fatalf("got %d sessions, want 2", len(sessions))
	}
	firstID, secondID := tokenSessionID(first), tokenSessionID(second)
	for _, session := range sessions {
		if session.Current != (session.ID == firstID) {
			t.Errorf("current marker wrong for %q: %+v", firstID, session)
		}
		if session.ID == secondID && session.UserAgent != "Chrome/2.0" {
			t.Errorf("second session identity = %+v", session)
		}
	}

	if response := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/"+secondID, first); response.Code != http.StatusNoContent {
		t.Fatalf("revoke status %d: %s", response.Code, response.Body.String())
	}
	if response := sessionRequest(t, handler, http.MethodPost, "/api/events", second); response.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session status %d", response.Code)
	}
	if response := sessionRequest(t, handler, http.MethodGet, "/api/collections/users/records/"+user.Id, second); response.Code == http.StatusOK {
		t.Fatal("revoked session can still read a native PocketBase record")
	}
	if remaining := readAuthSessions(t, handler, first); len(remaining) != 1 || !remaining[0].Current || remaining[0].ID != firstID {
		t.Fatalf("caller session changed: %+v", remaining)
	}
	if sessions := readAuthSessions(t, handler, otherToken); len(sessions) != 1 {
		t.Fatalf("another user was revoked or sees foreign sessions: %+v", sessions)
	}
	if response := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/"+secondID, first); response.Code != http.StatusNotFound {
		t.Fatalf("deleting an absent session returned %d", response.Code)
	}
}

func TestSessionCannotRevokeCurrentOrAnotherUsersSession(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	current := sessionLogin(t, handler, user.Email(), "1234567890", "current")
	other := core.NewRecord(user.Collection())
	other.SetEmail("foreign-session@example.com")
	other.SetPassword("different-password-123")
	if err := pb.Save(other); err != nil {
		t.Fatal(err)
	}
	foreign := sessionLogin(t, handler, other.Email(), "different-password-123", "foreign")

	if response := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/"+tokenSessionID(current), current); response.Code != http.StatusBadRequest {
		t.Fatalf("current session deletion returned %d", response.Code)
	}
	if response := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/"+tokenSessionID(foreign), current); response.Code != http.StatusNotFound {
		t.Fatalf("foreign session deletion returned %d", response.Code)
	}
	if sessions := readAuthSessions(t, handler, foreign); len(sessions) != 1 {
		t.Fatalf("foreign session was deleted: %+v", sessions)
	}
}

func TestSignOutDeletesOnlyCurrentSession(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	current := sessionLogin(t, handler, user.Email(), "1234567890", "current")
	other := sessionLogin(t, handler, user.Email(), "1234567890", "other")

	if response := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/current", current); response.Code != http.StatusNoContent {
		t.Fatalf("sign-out status %d: %s", response.Code, response.Body.String())
	}
	if response := sessionRequest(t, handler, http.MethodPost, "/api/events", current); response.Code != http.StatusUnauthorized {
		t.Fatalf("signed-out token returned %d", response.Code)
	}
	if sessions := readAuthSessions(t, handler, other); len(sessions) != 1 || sessions[0].ID != tokenSessionID(other) {
		t.Fatalf("sign-out affected another session: %+v", sessions)
	}
}

func TestSessionRefreshPreservesIdentity(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	original := sessionLogin(t, handler, user.Email(), "1234567890", "current")
	response := sessionRequest(t, handler, http.MethodPost, "/api/collections/users/auth-refresh", original)
	if response.Code != http.StatusOK {
		t.Fatalf("refresh status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if tokenSessionID(body.Token) != tokenSessionID(original) {
		t.Fatal("refresh changed the session id")
	}
	sessions := readAuthSessions(t, handler, body.Token)
	if len(sessions) != 1 || !sessions[0].Current || sessions[0].ID != tokenSessionID(original) {
		t.Fatalf("refresh created or lost sessions: %+v", sessions)
	}
}

func TestSessionStoresCanonicalTrustedProxyIP(t *testing.T) {
	pb, user := sessionTestApp(t)
	pb.Settings().TrustedProxy.Headers = []string{"X-Forwarded-For"}
	handler := sessionHandler(t, pb)
	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/auth-with-password", strings.NewReader(`{"identity":"test@example.com","password":"1234567890"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "0000:0000:0000:0000:0000:0000:0000:0001")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("login status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	sessions := readAuthSessions(t, handler, body.Token)
	if len(sessions) != 1 || sessions[0].IPAddress != "::1" {
		t.Fatalf("session IP = %+v, want canonical ::1 for user %s", sessions, user.Id)
	}
}

func TestLegacyTokenCanBeReplacedBySigningInAgain(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	legacy, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	if response := sessionRequest(t, handler, http.MethodPost, "/api/events", legacy); response.Code != http.StatusUnauthorized {
		t.Fatalf("legacy protected request returned %d", response.Code)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/auth-with-password", strings.NewReader(`{"identity":"test@example.com","password":"1234567890"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", legacy)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("legacy token prevented a fresh login: %d %s", response.Code, response.Body.String())
	}
}

func TestEventsRevokeOnlyTheDeletedSession(t *testing.T) {
	pb, user := sessionTestApp(t)
	handler := sessionHandler(t, pb)
	current := sessionLogin(t, handler, user.Email(), "1234567890", "current")
	target := sessionLogin(t, handler, user.Email(), "1234567890", "target")
	server := httptest.NewServer(handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", target)
	response, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("stream status %d", response.StatusCode)
	}
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() && scanner.Text() != "event: devices" {
	}
	if scanner.Err() != nil || scanner.Text() != "event: devices" {
		t.Fatalf("stream never started: %v", scanner.Err())
	}
	if deleted := sessionRequest(t, handler, http.MethodDelete, "/api/sessions/"+tokenSessionID(target), current); deleted.Code != http.StatusNoContent {
		t.Fatalf("revoke status %d: %s", deleted.Code, deleted.Body.String())
	}
	var remaining strings.Builder
	for scanner.Scan() {
		remaining.WriteString(scanner.Text())
		remaining.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("stream failed instead of closing: %v", err)
	}
	if !strings.Contains(remaining.String(), "event: auth-revoked\ndata: {}\n") {
		t.Fatalf("missing revocation event: %q", remaining.String())
	}
	if sessions := readAuthSessions(t, handler, current); len(sessions) != 1 || !sessions[0].Current {
		t.Fatalf("revoking the target revoked the caller: %+v", sessions)
	}
}
