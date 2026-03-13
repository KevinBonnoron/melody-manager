# API Reference

The Hono API server runs on port `3000` (development) or behind nginx at `/api` (Docker).

## Authentication

The API uses PocketBase for authentication. Obtain a token by authenticating through PocketBase, then pass it in the `Authorization` header.

## Endpoints

### Tracks

#### `GET /api/tracks/stream/:id`

Stream an audio track.

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `transcode` | Target format (e.g. `mp3`). If omitted, the original format is served. |

**Example:**

```http
GET /api/tracks/stream/abc123?transcode=mp3
```

### Albums

#### `GET /api/albums`

List albums in the library.

#### `GET /api/albums/:id`

Get album details including tracks.

### Artists

#### `GET /api/artists`

List artists in the library.

#### `GET /api/artists/:id`

Get artist details including albums.

### Search

#### `GET /api/search`

Search across all configured sources (local library, YouTube, Spotify, etc.).

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `q` | Search query |
| `type` | Search type (e.g. `track`, `album`, `artist`) |
| `provider` | Source provider to search (optional) |

### Playlists

#### `GET /api/playlists`

List user playlists.

#### `POST /api/playlists`

Create a new playlist.

### Devices

#### `GET /api/devices`

List available playback devices (Sonos speakers on the local network).

#### `POST /api/devices/:id/play`

Start playback on a device.

#### `POST /api/devices/:id/stop`

Stop playback on a device.

### Health

#### `GET /health`

Returns `200 OK` when the server is running. Used by Docker health checks.
