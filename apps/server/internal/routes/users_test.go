package routes

import (
	"encoding/json"
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

// usersTestHandler boots the API like importTestHandler does, and moreover
// gives the fixture users collection the role field the app migrations add,
// promoting test@example.com so the admin-only routes can be exercised.
func usersTestHandler(t *testing.T) (*tests.TestApp, http.Handler) {
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
	// A record keeps the cached collection, which must not be mutated: the
	// save-time schema sync diffs old against new and would see no change.
	// A freshly queried copy diffs against the cache and alters the table.
	collection, err := pb.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	collection.Fields.Add(&core.SelectField{Name: "role", Required: true, MaxSelect: 1, Values: []string{"user", "admin"}})
	if err := pb.Save(collection); err != nil {
		t.Fatalf("saving the users collection: %v", err)
	}
	user, err = pb.FindAuthRecordByEmail("users", "test@example.com")
	if err != nil {
		t.Fatal(err)
	}
	user.Set("role", "admin")
	if err := pb.Save(user); err != nil {
		t.Fatalf("promoting the fixture user: %v", err)
	}
	// The fixture enables MFA; this handler exercises the admin routes, not
	// the second-factor challenge that intentionally precedes them.
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
	return pb, handler
}

func usersCreateRequest(t *testing.T, handler http.Handler, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func TestCreateUserRefusesANonAdministrator(t *testing.T) {
	_, handler := usersTestHandler(t)
	token := sessionLogin(t, handler, "test2@example.com", "1234567890", "Firefox/1.0")

	response := usersCreateRequest(t, handler, token, `{"email":"made@example.com","password":"1234567890"}`)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestCreateUserMakesASignableAccount(t *testing.T) {
	pb, handler := usersTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	response := usersCreateRequest(t, handler, token, `{"email":"made@example.com","password":"made-password","name":"Made","role":"admin"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	record, err := pb.FindAuthRecordByEmail("users", "made@example.com")
	if err != nil {
		t.Fatalf("the account was not created: %v", err)
	}
	if record.GetString("role") != "admin" || record.GetString("name") != "Made" {
		t.Fatalf("unexpected account: role %q, name %q", record.GetString("role"), record.GetString("name"))
	}
	if login := sessionLogin(t, handler, "made@example.com", "made-password", "Firefox/1.0"); login == "" {
		t.Fatal("the new account cannot sign in")
	}
}

func TestCreateUserDefaultsAnUnknownRoleToUser(t *testing.T) {
	pb, handler := usersTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	response := usersCreateRequest(t, handler, token, `{"email":"made@example.com","password":"made-password","role":"superadmin"}`)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	record, err := pb.FindAuthRecordByEmail("users", "made@example.com")
	if err != nil {
		t.Fatalf("the account was not created: %v", err)
	}
	if record.GetString("role") != "user" {
		t.Fatalf("an unknown role must fall back to user, got %q", record.GetString("role"))
	}
}

func TestCreateUserRequiresARealPassword(t *testing.T) {
	_, handler := usersTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	for name, body := range map[string]string{
		"no password at all": `{"email":"made@example.com"}`,
		"a short password":   `{"email":"made@example.com","password":"short"}`,
	} {
		response := usersCreateRequest(t, handler, token, body)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d: %s", name, response.Code, response.Body.String())
		}
	}
}

// The create-user dialog reads the reason out of data.email.message, so the shape of a
// refused email is part of the route's contract.
func TestCreateUserReportsAnEmailProblemUnderDataEmail(t *testing.T) {
	_, handler := usersTestHandler(t)
	token := sessionLogin(t, handler, "test@example.com", "1234567890", "Firefox/1.0")

	for name, body := range map[string]string{
		"a malformed email": `{"email":"not-an-email","password":"made-password"}`,
		"a duplicate email": `{"email":"test2@example.com","password":"made-password"}`,
	} {
		response := usersCreateRequest(t, handler, token, body)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d: %s", name, response.Code, response.Body.String())
		}
		var payload struct {
			Data struct {
				Email struct {
					Message string `json:"message"`
				} `json:"email"`
			} `json:"data"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: unreadable body %q: %v", name, response.Body.String(), err)
		}
		if payload.Data.Email.Message == "" {
			t.Fatalf("%s: no data.email.message in %s", name, response.Body.String())
		}
	}
}
