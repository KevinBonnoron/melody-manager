package player

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	// The system schema (_collections among it) is created by PocketBase's own
	// migrations, which register themselves on import.
	_ "github.com/pocketbase/pocketbase/migrations"
)

// storeApp boots a throwaway PocketBase with the playback_state collection in
// the shape the migrations leave it, for store tests that read and write real
// records.
func storeApp(t *testing.T) (core.App, *core.Collection) {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	tracks := core.NewBaseCollection("tracks")
	tracks.Fields.Add(&core.TextField{Name: "title"})
	if err := app.Save(tracks); err != nil {
		t.Fatal(err)
	}

	col := core.NewBaseCollection("playback_state")
	col.Fields.Add(
		&core.TextField{Name: "user", Required: true},
		&core.RelationField{Name: "track", MaxSelect: 1, CollectionId: tracks.Id},
		&core.NumberField{Name: "position"},
		&core.BoolField{Name: "playing"},
		&core.JSONField{Name: "list", MaxSize: 1 << 20},
		&core.JSONField{Name: "devices", MaxSize: 1 << 16},
		&core.JSONField{Name: "order", MaxSize: 1 << 20},
		&core.NumberField{Name: "index"},
		&core.BoolField{Name: "shuffle"},
		&core.TextField{Name: "repeat"},
		&core.DateField{Name: "positionAt"},
		&core.DateField{Name: "beganAt"},
	)
	if err := app.Save(col); err != nil {
		t.Fatal(err)
	}
	return app, col
}

// A claim on a record with nothing playing yet is a record too: the devices
// it names are the places the next sound is meant to come out of, and a
// record found empty would turn the next order into one that reaches nobody.
func TestSaveKeepsDevicesWithoutTrack(t *testing.T) {
	app, _ := storeApp(t)
	store := NewStore(app)

	if err := store.Save("u1", State{Devices: []string{"d1", "d2"}}); err != nil {
		t.Fatal(err)
	}

	state, err := store.Load("u1")
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Devices) != 2 {
		t.Fatalf("devices = %v, want the claimed ones kept", state.Devices)
	}
}

// Nothing playing and nowhere to play it is the absence of a record, not an
// empty one: a leftover would be a claim nobody made.
func TestSaveWithoutTrackOrDevicesLeavesNoRecord(t *testing.T) {
	app, col := storeApp(t)
	store := NewStore(app)

	existing := core.NewRecord(col)
	existing.Set("user", "u1")
	existing.Set("devices", `["d1"]`)
	if err := app.Save(existing); err != nil {
		t.Fatal(err)
	}

	if err := store.Save("u1", State{}); err != nil {
		t.Fatal(err)
	}

	if record, _ := store.find("u1"); record != nil {
		t.Fatal("a record with nothing playing and nowhere to play it was kept")
	}
}
