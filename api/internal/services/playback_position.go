package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// PlaybackPositions writes the resume point of a user's playback.
//
// It exists for speakers: they play with no client watching, so the position
// would otherwise be recorded by a browser that is not playing anything, or by
// nobody at all once every browser is closed.
type PlaybackPositions struct {
	app core.App
}

func NewPlaybackPositions(app core.App) *PlaybackPositions {
	return &PlaybackPositions{app: app}
}

// SavePosition records where this user's playback got to. The queue is left
// alone: only a client knows what it is playing next, and only the fields
// touched here are written.
func (p *PlaybackPositions) SavePosition(owner, trackID string, position float64) error {
	record, err := p.app.FindFirstRecordByFilter("playback_state", "user = {:user}", dbx.Params{"user": owner})
	if err != nil {
		collection, err := p.app.FindCollectionByNameOrId("playback_state")
		if err != nil {
			return err
		}

		record = core.NewRecord(collection)
		record.Set("user", owner)
		record.Set("queue", []string{})
	}

	record.Set("track", trackID)
	record.Set("position", position)
	return p.app.Save(record)
}
