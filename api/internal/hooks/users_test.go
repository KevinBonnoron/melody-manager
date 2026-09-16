package hooks

import "testing"

// An instance with no way in is worse than an open one, so the first account
// administers it. Nobody after it says what they are.
func TestRoleForNewUser(t *testing.T) {
	cases := []struct {
		name     string
		existing int64
		asked    string
		want     string
	}{
		{"the first account administers the instance", 0, "", "admin"},
		{"and does so whatever it asked for", 0, "user", "admin"},
		{"everyone after it is a user", 3, "", "user"},
		{"asking to be an administrator does not make one", 3, "admin", "admin"},
	}
	for _, c := range cases {
		if got := roleForNewUser(c.existing, c.asked); got != c.want {
			t.Errorf("%s: roleForNewUser(%d, %q) = %q, want %q", c.name, c.existing, c.asked, got, c.want)
		}
	}
}

// The switch governs people signing themselves up. The first account is always
// allowed, or a fresh install with sign-ups closed could never be set up.
func TestMayRegister(t *testing.T) {
	cases := []struct {
		name     string
		existing int64
		allowed  bool
		want     bool
	}{
		{"a fresh install with sign-ups closed", 0, false, true},
		{"a second account with sign-ups closed", 1, false, false},
		{"a second account with sign-ups open", 1, true, true},
	}
	for _, c := range cases {
		if got := mayRegister(c.existing, c.allowed); got != c.want {
			t.Errorf("%s: mayRegister(%d, %v) = %v, want %v", c.name, c.existing, c.allowed, got, c.want)
		}
	}
}

// PocketBase rules are record-level, so the users updateRule lets an account
// PATCH any field of its own record, role included, and role is the only gate on
// the admin routes. An administrator may change someone else's; nobody may
// change their own, which is also what stops a lone administrator locking
// themselves out.
func TestRoleAfterUpdate(t *testing.T) {
	cases := []struct {
		name               string
		stored             string
		asked              string
		editorRole         string
		editingSomeoneElse bool
		want               string
	}{
		{"a user promoting themselves", "user", "admin", "user", false, "user"},
		{"an administrator promoting themselves again", "admin", "admin", "admin", false, "admin"},
		{"an administrator demoting themselves", "admin", "user", "admin", false, "admin"},
		{"an administrator promoting someone else", "user", "admin", "admin", true, "admin"},
		{"an administrator demoting someone else", "admin", "user", "admin", true, "user"},
		{"a user promoting someone else", "user", "admin", "user", true, "user"},
		{"nobody signed in at all", "user", "admin", "", false, "user"},
	}
	for _, c := range cases {
		got := roleAfterUpdate(c.stored, c.asked, c.editorRole, c.editingSomeoneElse)
		if got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
