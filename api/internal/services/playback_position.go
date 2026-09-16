package services

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// PlaybackPositions writes the resume point of a user's playback.
type PlaybackPositions struct {
	app core.App
}

func NewPlaybackPositions(app core.App) *PlaybackPositions {
	return &PlaybackPositions{app: app}
}

// SavePosition records where this user's playback got to.
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
