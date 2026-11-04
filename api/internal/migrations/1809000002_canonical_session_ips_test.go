package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestCanonicalSessionIPsUpdatesExistingRows(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	defer app.ResetBootstrapState()

	collection := core.NewBaseCollection("user_sessions")
	collection.Fields.Add(&core.TextField{Name: "ipAddress"})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	inputs := []string{
		"0000:0000:0000:0000:0000:0000:0000:0001",
		"0000:0000:0000:0000:0000:ffff:ac13:0001",
		"not-an-ip",
	}
	for _, input := range inputs {
		record := core.NewRecord(collection)
		record.Set("ipAddress", input)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
	if err := canonicalSessionIPs(app); err != nil {
		t.Fatal(err)
	}
	records, err := app.FindAllRecords("user_sessions")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"::1", "172.19.0.1", "not-an-ip"}
	for i, record := range records {
		if got := record.GetString("ipAddress"); got != want[i] {
			t.Errorf("row %d IP = %q, want %q", i, got, want[i])
		}
	}
}
