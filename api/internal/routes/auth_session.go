package routes

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/KevinBonnoron/melody-manager/api/internal/netaddr"
)

const (
	userSessionsCollection = "user_sessions"
	sessionTokenClaim      = "sid"
	requestSessionKey      = "melody.authSession"
	refreshSessionKey      = "melody.refreshSession"
	realtimeSessionKey     = "melody.realtimeSession"
)

func requestToken(e *core.RequestEvent) string {
	token := e.Request.Header.Get("Authorization")
	if len(token) > 7 && strings.EqualFold(token[:7], "Bearer ") {
		return token[7:]
	}
	return token
}

func tokenSessionID(token string) string {
	claims, err := security.ParseUnverifiedJWT(token)
	if err != nil {
		return ""
	}
	sid, _ := claims[sessionTokenClaim].(string)
	return sid
}

func currentSessionID(e *core.RequestEvent) string {
	sid, _ := e.Get(requestSessionKey).(string)
	return sid
}

// signAuthSession keeps every standard PocketBase claim and signature rule,
// adding only the server-issued session identifier.
func signAuthSession(record *core.Record, token, sid string) (string, types.DateTime, error) {
	claims, err := security.ParseUnverifiedJWT(token)
	if err != nil {
		return "", types.DateTime{}, err
	}
	claims[sessionTokenClaim] = sid
	signed, err := security.NewJWT(claims, record.TokenKey()+record.Collection().AuthToken.Secret, 0)
	if err != nil {
		return "", types.DateTime{}, err
	}
	expires, err := claims.GetExpirationTime()
	if err != nil || expires == nil {
		return "", types.DateTime{}, apis.NewInternalServerError("the auth token has no valid expiration", err)
	}
	at, err := types.ParseDateTime(expires.Time.UTC())
	return signed, at, err
}

// RegisterAuthSessions creates one registry entry per sign-in and keeps its id
// when PocketBase refreshes the JWT. The transaction also covers MFA: a challenge
// is not a signed-in session and its entry is rolled back with the response error.
func RegisterAuthSessions(app core.App) {
	app.OnRecordAuthRefreshRequest("users").BindFunc(func(e *core.RecordAuthRefreshRequestEvent) error {
		e.Set(refreshSessionKey, tokenSessionID(requestToken(e.RequestEvent)))
		return e.Next()
	})

	app.OnRecordAuthRequest("users").BindFunc(func(e *core.RecordAuthRequestEvent) error {
		original := e.App
		defer func() { e.App = original }()
		return original.RunInTransaction(func(txApp core.App) error {
			e.App = txApp
			sid, _ := e.Get(refreshSessionKey).(string)
			var session *core.Record
			if sid != "" {
				var err error
				session, err = txApp.FindRecordById(userSessionsCollection, sid)
				if err != nil || session.GetString("user") != e.Record.Id {
					return apis.NewUnauthorizedError("the session is no longer active", err)
				}
			} else {
				collection, err := txApp.FindCollectionByNameOrId(userSessionsCollection)
				if err != nil {
					return err
				}
				session = core.NewRecord(collection)
				session.Id = security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
				session.Set("user", e.Record.Id)
				session.Set("ipAddress", netaddr.Canonical(e.RealIP()))
				session.Set("userAgent", e.Request.UserAgent())
			}

			token, expires, err := signAuthSession(e.Record, e.Token, session.Id)
			if err != nil {
				return err
			}
			e.Token = token
			session.Set("expiresAt", expires)
			if err := txApp.Save(session); err != nil {
				return err
			}
			return e.Next()
		})
	})

	// PocketBase realtime clients keep their auth record after subscribing.
	// Associate it with the same session so a revocation also stops record pushes.
	app.OnRealtimeSubscribeRequest().BindFunc(func(e *core.RealtimeSubscribeRequestEvent) error {
		if sid := currentSessionID(e.RequestEvent); sid != "" {
			e.Client.Set(realtimeSessionKey, sid)
		}
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess(userSessionsCollection).BindFunc(func(e *core.RecordEvent) error {
		for _, chunk := range e.App.SubscriptionsBroker().ChunkedClients(100) {
			for _, client := range chunk {
				if client.Get(realtimeSessionKey) == e.Record.Id {
					client.Unset(apis.RealtimeClientAuthKey)
				}
			}
		}
		return e.Next()
	})
}

// bindAuthSessionMiddleware runs after PocketBase has verified the JWT and
// loaded its user. Invalid or revoked credentials become anonymous so public
// endpoints and a fresh password sign-in still work; protected routes return
// PocketBase's normal authorization error.
func bindAuthSessionMiddleware(se *core.ServeEvent) {
	se.Router.Bind(&hook.Handler[*core.RequestEvent]{
		Priority: apis.DefaultLoadAuthTokenMiddlewarePriority + 1,
		Func: func(e *core.RequestEvent) error {
			if e.Auth == nil || e.Auth.Collection().Name != "users" {
				return e.Next()
			}

			sid := tokenSessionID(requestToken(e))
			if sid != "" {
				session, err := e.App.FindRecordById(userSessionsCollection, sid)
				if err == nil && session.GetString("user") == e.Auth.Id && session.GetDateTime("expiresAt").Time().After(time.Now()) {
					e.Set(requestSessionKey, sid)
					return e.Next()
				}
			}

			e.Auth = nil
			if strings.HasSuffix(e.Request.URL.Path, "/auth-refresh") {
				return e.UnauthorizedError("the session is no longer active", nil)
			}
			return e.Next()
		},
	})
}

func signOutCurrentSession(e *core.RequestEvent) error {
	sid := currentSessionID(e)
	if sid == "" {
		return e.UnauthorizedError("an active session is required", nil)
	}
	err := e.App.RunInTransaction(func(txApp core.App) error {
		current, err := txApp.FindRecordById(userSessionsCollection, sid)
		if err != nil || current.GetString("user") != e.Auth.Id {
			return apis.NewUnauthorizedError("the current session is no longer active", err)
		}
		return txApp.Delete(current)
	})
	if err != nil {
		return err
	}
	return e.NoContent(http.StatusNoContent)
}

func revokeAuthSession(e *core.RequestEvent) error {
	currentID := currentSessionID(e)
	targetID := e.Request.PathValue("id")
	if currentID == "" {
		return e.UnauthorizedError("an active session is required", nil)
	}
	if targetID == currentID {
		return e.BadRequestError("use sign out for the current session", nil)
	}

	err := e.App.RunInTransaction(func(txApp core.App) error {
		current, err := txApp.FindRecordById(userSessionsCollection, currentID)
		if err != nil || current.GetString("user") != e.Auth.Id {
			return apis.NewUnauthorizedError("the current session is no longer active", err)
		}
		target, err := txApp.FindRecordById(userSessionsCollection, targetID)
		if err != nil {
			return apis.NewNotFoundError("session not found", err)
		}
		if target.GetString("user") != e.Auth.Id {
			return apis.NewNotFoundError("session not found", nil)
		}
		return txApp.Delete(target)
	})
	if err != nil {
		return err
	}
	return e.NoContent(http.StatusNoContent)
}

// watchAuthRevocation binds before the registry read, closing the race between
// authentication middleware and stream startup. Only committed deletes count.
func watchAuthRevocation(app core.App, auth *core.Record, sid string) (<-chan struct{}, func()) {
	revoked := make(chan struct{})
	var once sync.Once
	revoke := func() { once.Do(func() { close(revoked) }) }
	sessions := app.OnRecordAfterDeleteSuccess(userSessionsCollection)
	users := app.OnRecordAfterDeleteSuccess(auth.Collection().Id)
	sessionHook := sessions.BindFunc(func(e *core.RecordEvent) error {
		if e.Record.Id == sid {
			revoke()
		}
		return e.Next()
	})
	userHook := users.BindFunc(func(e *core.RecordEvent) error {
		if e.Record.Id == auth.Id {
			revoke()
		}
		return e.Next()
	})
	current, err := app.FindRecordById(userSessionsCollection, sid)
	if err != nil || current.GetString("user") != auth.Id {
		revoke()
	}
	return revoked, func() {
		sessions.Unbind(sessionHook)
		users.Unbind(userHook)
	}
}
