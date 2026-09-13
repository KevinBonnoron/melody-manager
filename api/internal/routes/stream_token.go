package routes

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// A stream URL cannot carry a header: an <audio> element sets its src directly
// and a speaker fetches the address itself. So the permission travels in the
// query string, and what travels there has to be worth no more than the thing
// it unlocks.
//
// It used to be an ordinary auth token. That made the URL handed to a speaker a
// session: it was accepted by every authenticated endpoint, it sat in the
// speaker's own CurrentURI for anyone on the network to read back, and it could
// only be revoked by changing the account's password.
//
// This one says one thing, "this listener may read this track until this
// moment", and only the stream route accepts it.
const streamTokenTTL = time.Hour

// Long enough to cover a track and the speaker coming back for the rest of it,
// short enough that a URL read off the network is worth little by the time it
// is. It is scoped to one track either way.

var errBadStreamToken = errors.New("invalid stream token")

func streamTokenKey(app core.App) ([]byte, error) {
	// The users collection's own token secret, which the server already holds and
	// already protects. Prefixed below so a stream token can never be mistaken
	// for, or forged from, anything else signed with it.
	col, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, err
	}
	secret := col.AuthToken.Secret
	if secret == "" {
		return nil, errors.New("missing signing key")
	}
	return []byte(secret), nil
}

func signStream(key []byte, payload string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("melody.stream.v1."))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// mintStreamToken issues the permission to read one track, for one listener,
// until it expires.
func mintStreamToken(app core.App, userID, trackID string) (string, error) {
	key, err := streamTokenKey(app)
	if err != nil {
		return "", err
	}

	payload := userID + "." + trackID + "." + strconv.FormatInt(time.Now().Add(streamTokenTTL).Unix(), 10)
	return payload + "." + signStream(key, payload), nil
}

// readStreamToken returns the listener a token speaks for, if it is genuine,
// unexpired, and about this track.
func readStreamToken(app core.App, raw, trackID string) (string, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 4 {
		return "", errBadStreamToken
	}

	payload := strings.Join(parts[:3], ".")
	key, err := streamTokenKey(app)
	if err != nil {
		return "", err
	}
	// Constant time, so a wrong signature tells the caller nothing about how
	// close it was.
	if !hmac.Equal([]byte(parts[3]), []byte(signStream(key, payload))) {
		return "", errBadStreamToken
	}
	if parts[1] != trackID {
		return "", errBadStreamToken
	}

	expiry, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > expiry {
		return "", errBadStreamToken
	}

	return parts[0], nil
}
