package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type trackRating struct {
	ID    string `json:"id"`
	User  string `json:"user"`
	Track string `json:"track"`
	Value string `json:"value"`
}

func tokenUserID(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(payload, &claims) != nil {
		return ""
	}
	return claims.ID
}

func loadTrackRatings(c *client) (map[string]trackRating, error) {
	records, err := listRecords[trackRating](c, "track_ratings", nil)
	if err != nil {
		return nil, err
	}
	ratings := make(map[string]trackRating, len(records))
	for _, rating := range records {
		ratings[rating.Track] = rating
	}
	return ratings, nil
}

// rateTrack toggles value when it is already set, replaces the opposite value,
// and creates the user's rating when none exists yet.
func (c *client) rateTrack(current trackRating, trackID, value string) (trackRating, error) {
	path := "/api/collections/track_ratings/records"
	if current.ID == "" {
		if c.userID == "" {
			return trackRating{}, errors.New("the session has no user identity; sign in again")
		}
		var created trackRating
		err := c.send(http.MethodPost, path, map[string]string{
			"user": c.userID, "track": trackID, "value": value,
		}, &created)
		return created, err
	}

	path += "/" + current.ID
	if current.Value == value {
		return trackRating{}, c.send(http.MethodDelete, path, nil, nil)
	}
	var updated trackRating
	err := c.send(http.MethodPatch, path, map[string]string{"value": value}, &updated)
	return updated, err
}
