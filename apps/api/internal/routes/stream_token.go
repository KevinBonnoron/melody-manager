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

const streamTokenTTL = time.Hour

var errBadStreamToken = errors.New("invalid stream token")

func streamTokenKey(app core.App) ([]byte, error) {
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

func mintStreamToken(app core.App, userID, trackID string) (string, error) {
	key, err := streamTokenKey(app)
	if err != nil {
		return "", err
	}

	payload := userID + "." + trackID + "." + strconv.FormatInt(time.Now().Add(streamTokenTTL).Unix(), 10)
	return payload + "." + signStream(key, payload), nil
}

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
