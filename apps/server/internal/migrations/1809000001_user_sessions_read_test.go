package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestAllowUserSessionReadUpdatesExistingCollection(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	defer app.ResetBootstrapState()

	sessions := core.NewBaseCollection("user_sessions")
	sessions.Fields.Add(&core.TextField{Name: "user", Required: true})
	if err := app.Save(sessions); err != nil {
		t.Fatal(err)
	}
	if err := allowUserSessionRead(app); err != nil {
		t.Fatal(err)
	}
	updated, err := app.FindCollectionByNameOrId("user_sessions")
	if err != nil {
		t.Fatal(err)
	}
	if updated.ListRule == nil || *updated.ListRule != "user = @request.auth.id" || updated.ViewRule == nil || *updated.ViewRule != "user = @request.auth.id" {
		t.Fatalf("owner read rules not applied: list=%v view=%v", updated.ListRule, updated.ViewRule)
	}
	if updated.CreateRule != nil || updated.UpdateRule != nil || updated.DeleteRule != nil {
		t.Fatal("migration opened session writes")
	}
}
