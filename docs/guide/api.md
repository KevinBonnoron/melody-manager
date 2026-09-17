# HTTP API

Everything is under `/api`, on the same origin as the client. There are two
halves to it.

**The collections** are PocketBase's own REST API: tracks, albums, artists,
playlists, users, and the rest, at `/api/collections/{name}/records` with
PocketBase's filtering, sorting, expansion and realtime subscriptions. Its
[own documentation](https://pocketbase.io/docs/api-records/) covers them, and
the [JavaScript SDK](https://pocketbase.io/docs/client-side-integration/) is
what the client uses.

**The endpoints below** are what collections cannot express: streaming,
speakers, importing, search across sources.

## Authenticating

Authenticate against the `users` collection and send the token as a bearer:

```bash
TOKEN=$(curl -s -X POST http://localhost:8090/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"you@example.com","password":"..."}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/devices
```

That call is itself unauthenticated, of course: it is how the token is obtained.
Every endpoint on this page requires the header but these, which sit outside the
authenticated group because the caller cannot set one. An `<audio>` element is
handed a URL, and a speaker fetches the URL by itself.

| Endpoint outside the group | What it answers to instead |
|---|---|
| `GET /api/tracks/{id}/stream` | a short-lived token in the query string, minted per track |
| `GET /api/tracks/{id}/peaks` | the same token, for the same track |
| `GET /api/albums/{id}/cover` | nothing: the artwork was already public |
| `GET /api/share/stream/{token}` | the share link's own token |
| `GET /api/config` | anyone, but it answers less: one flag without the header, the whole file with an administrator's |
| `GET /api/health` | nothing: it says only that the server is up |

## Audio

### `GET /api/tracks/{id}/stream`

The audio. `?transcode=mp3` converts on the way out; without it the original
format is served. `?token=` carries a stream token when no header can be set.

### `GET /api/stream-token?track={id}`

Mints that token, for one track, valid briefly. Returns `{ token, expiresIn }`.

### `GET /api/tracks/{id}/peaks`

The waveform, as normalised peaks, for drawing the position bar. Reached the same
way as the audio and by the same permission. Audio that cannot be decoded gives
an empty list rather than an error: the waveform is decoration.

### `GET /api/albums/{id}/cover`

The album artwork at a plain, stable path. Sonos is less tolerant than a browser
of the URL shape PocketBase files uploads under, which is why this exists.

### `GET /api/share/stream/{token}`

Audio behind a share link, for someone with no account. Gone when the link is
revoked or has expired, and the first request that is not a range request counts
as a play.

## Devices

### `GET /api/devices`

Every device the server knows: speakers on the network and browsers signed in,
with what each is playing.

### `POST /api/devices/{id}/play` · `play/{trackId}`

Start playing, optionally naming the track.

### `POST /api/devices/{id}/pause` · `stop` · `next` · `previous`

Transport, for whichever kind of device it is.

### `POST /api/devices/{id}/seek`

Move within the track. Seconds, in the body.

### `POST /api/devices/{id}/volume`

Set the level, 0 to 100.

### `POST /api/devices/{id}/state`

What a browser reports about itself: what it is playing and where it has got to.

A device asked for something its protocol has no word for answers `501`: a
Chromecast handed a single track has no queue, so "next" is a question it cannot
be asked rather than a failure. A device that cannot be reached at all answers
`502`.

## Library

### `POST /api/search`

Search across the sources that are enabled and connected for the caller. The
query, the kinds wanted and the sources to ask go in the body.

### `POST /api/tracks/add` · `albums` · `artists` · `playlists`

Import a search result into the library, by the kind of thing it is. The body is
`{"url": "..."}`, where the URL is the `origin` the search result carried; which
source it belongs to follows from it. Returns a task, watched through
`/api/tasks`.

### `POST /api/tracks/preview`

Resolve a URL the way an import would, and return what it would add without
adding anything. The body is `{"url": "..."}` and the answer is
`{"tracks": [...]}`. A video cut on its chapters comes back as one entry per
chapter, each carrying the `startTime` and `endTime` it would be cut on, so the
caller can show the track list before importing it.

### `POST /api/local/scan`

Walk the local music directory again. Returns a task; watch it through
`/api/tasks`. Files already known are skipped, and files that went missing are
marked present again if the walk finds them.

### `POST /api/library/check`

Verify that what the library claims is still there.

### `POST /api/albums/{id}/download` · `check` · `cover` · `resync`

Per-album operations: fetch the audio for a remote album, verify it, look the
artwork up again, re-read it from the source.

### `PATCH /api/albums/{id}` · `PATCH /api/artists/{id}`

Edit the parts of an album or an artist that are not free for anyone to change
through the collection API.

## Playlists

| Method | Path |
|---|---|
| `GET` | `/api/playlists` |
| `GET` | `/api/playlists/{id}` |
| `POST` | `/api/playlists` |
| `PUT` | `/api/playlists/{id}` |
| `DELETE` | `/api/playlists/{id}` |
| `POST` | `/api/playlists/{id}/tracks` |
| `DELETE` | `/api/playlists/{id}/tracks/{trackId}` |

## The rest

### `GET /api/config` · `PATCH /api/config`

The operator settings. Anyone gets `registrationAllowed`; an administrator gets
the whole file, and the path it was read from. A `PATCH` carrying part of it
changes only what it carries.

### `GET /api/config/address-candidates`

The addresses this server actually has on the network, for setting `publicUrl`
without guessing. Administrators only.

### `GET /api/plugins`

The source manifests, each saying what it can do and whether it is missing
configuration.

### `GET /api/stats/overview`

Plays, listening time, top tracks, artists, albums and genres.

### `POST /api/events`

A server-sent event stream: playback, devices, tasks. A `POST` rather than a
`GET` so it can carry the bearer header like everything else, and so the client
can declare itself in the body, which is how it shows up as a device to other
sessions.

### `GET /api/tasks` · `DELETE /api/tasks/completed`

Long-running work such as scans, imports and downloads, with their progress.

### `GET /api/health`

`200` once the server is up. The Docker image uses it as its healthcheck.
