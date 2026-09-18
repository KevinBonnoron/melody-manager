package player

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Store keeps one playback record per user.
type Store struct {
	app core.App
}

func NewStore(app core.App) *Store {
	return &Store{app: app}
}

// Load reads what a user is playing. A user who has never played anything has
// no record, and gets the zero state; a database that cannot answer is not the
// same thing and says so.
func (s *Store) Load(owner string) (State, error) {
	record, err := s.find(owner)
	if err != nil {
		return State{}, err
	}
	if record == nil {
		return State{}, nil
	}

	state := State{
		Track:    record.GetString("track"),
		Position: record.GetFloat("position"),
		Playing:  record.GetBool("playing"),
		Device:   record.GetString("device"),
		Index:    record.GetInt("queueIndex"),
		Shuffle:  record.GetBool("shuffle"),
		Repeat:   Repeat(record.GetString("repeat")),
	}
	if at := record.GetDateTime("positionAt"); !at.IsZero() {
		state.PositionAt = at.Time()
	}
	decode(record, "queue", &state.Queue)
	decode(record, "order", &state.Order)
	return state.Sound(), nil
}

// Save writes the record back, creating it the first time. A state with
// nothing to play is not a record but the absence of one, so any record left
// over goes: keeping it would bring the removed track back on the next read.
func (s *Store) Save(owner string, state State) error {
	record, err := s.find(owner)
	if err != nil {
		return err
	}

	if state.Track == "" {
		if record == nil {
			return nil
		}
		return s.app.Delete(record)
	}

	if record == nil {
		collection, err := s.app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
		record.Set("user", owner)
	}

	queue := state.Queue
	if queue == nil {
		queue = []string{}
	}
	order := state.Order
	if order == nil {
		order = []int{}
	}

	record.Set("track", state.Track)
	record.Set("position", state.Position)
	record.Set("playing", state.Playing)
	record.Set("device", state.Device)
	record.Set("queue", queue)
	record.Set("order", order)
	record.Set("queueIndex", state.Index)
	record.Set("shuffle", state.Shuffle)
	record.Set("repeat", string(state.Repeat))
	record.Set("positionAt", positionAt(state.PositionAt))
	return s.app.Save(record)
}

func positionAt(at time.Time) types.DateTime {
	if at.IsZero() {
		at = time.Now()
	}
	stamp, _ := types.ParseDateTime(at.UTC())
	return stamp
}

func decode[T any](record *core.Record, field string, into *T) {
	raw := record.Get(field)
	blob, ok := raw.(types.JSONRaw)
	if !ok || len(blob) == 0 {
		return
	}
	_ = json.Unmarshal(blob, into)
}

func (s *Store) find(owner string) (*core.Record, error) {
	record, err := s.app.FindFirstRecordByFilter("playback_state", "user = {:user}", dbx.Params{"user": owner})
	if err == nil {
		return record, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return nil, err
}
