# Melody Manager — Go API (embedded PocketBase)

Single Go binary that embeds PocketBase (DB, auth, admin UI, REST, realtime) and
adds the melody-specific endpoints. Replaces the old `server/` (Hono) + `db/`
(PocketBase binary). See `docs/design/go-migration-plan.md`.

## Run

Go, ffmpeg and yt-dlp are provided by the nix dev shell, so run through it:

```bash
cd api
nix develop -c go run . serve --http 127.0.0.1:8090
# build a binary instead:
nix develop -c bash -c 'CGO_ENABLED=0 go build -o ../bin/melody-api .'
```

`CGO_ENABLED=0` is required (PocketBase uses the pure-Go `modernc.org/sqlite`).
Migrations apply automatically on boot. First run prints an admin setup URL
(`/_/`); or create one non-interactively:

```bash
nix develop -c go run . superuser upsert admin@example.com 'your-password'
```

- Admin UI: http://127.0.0.1:8090/_/
- REST API: http://127.0.0.1:8090/api/

## Endpoints

PocketBase serves auth, realtime, files and the **collections API** — the client
reads `albums`/`artists`/`tracks`/`playlists` directly via
`/api/collections/{name}/records`, so those need no custom routes.

Custom melody endpoints (under `/api`): `GET /plugins`, `POST /search`,
`POST /{albums,artists,tracks,playlists}/add`, `POST /local/scan`,
`GET /tracks/stream/{id}` (range + `?transcode=mp3|wav|flac|aac`),
`GET /tracks/peaks/{id}`, `GET /stats/overview`, `GET /stats/play-counts`,
`GET /playlists`, `GET /playlists/{id}`, `GET /tasks`,
`DELETE /tasks/completed`, `GET /tasks/events` (SSE), `GET /share/stream/{token}`.

## Quick test — local library

1. In the admin UI, add a `provider_settings` record: `type=local`,
   `enabled=true`, `config={"path":"/path/to/music"}`.
2. `curl -X POST http://127.0.0.1:8090/api/local/scan`
3. `curl http://127.0.0.1:8090/api/collections/tracks/records`

## Not yet ported (tracked in the migration plan)

Sonos devices + discovery, metadata enrichment (MusicBrainz/Deezer), the live
filesystem watcher, smart-playlist refresh, and the deployment cutover
(docker/turbo/CI; deleting `server/` + `db/`).
