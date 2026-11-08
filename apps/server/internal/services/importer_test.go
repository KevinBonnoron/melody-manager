package services

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestGetOrCreateReusesConcurrentWinner(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection("entries")
	collection.Fields.Add(&core.TextField{Name: "name", Required: true})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	if _, err := app.DB().NewQuery("CREATE UNIQUE INDEX idx_entries_name ON entries (name)").Execute(); err != nil {
		t.Fatal(err)
	}

	winnerID := ""
	insertingWinner := false
	app.OnRecordCreate("entries").BindFunc(func(e *core.RecordEvent) error {
		if insertingWinner {
			return e.Next()
		}
		insertingWinner = true
		winner := core.NewRecord(collection)
		winner.Set("name", "shared")
		if err := e.App.Save(winner); err != nil {
			return err
		}
		winnerID = winner.Id
		return e.Next()
	})

	record, err := getOrCreate(app, "entries", "name = {:name}", dbx.Params{"name": "shared"}, func(record *core.Record) {
		record.Set("name", "shared")
	})
	if err != nil {
		t.Fatalf("the losing insert should reuse the winner: %v", err)
	}
	if record.Id != winnerID {
		t.Fatalf("got record %q, want concurrent winner %q", record.Id, winnerID)
	}

	count, err := app.CountRecords("entries")
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("got %d records, want exactly one", count)
	}
}
