# Configuration

Melody Manager is configured through environment variables and PocketBase settings.

## Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Runtime environment (`development` or `production`) |
| `PORT` | `3000` | API server port |
| `PB_URL` | `http://localhost:8090` | PocketBase URL (internal) |
| `CACHE_DIR` | `/tmp/melody-manager-cache` | Directory for cached audio files |
| `CACHE_MAX_FILES` | `500` | Maximum number of cached files |
| `CACHE_MAX_SIZE` | `5GB` | Maximum total cache size |

### Client

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PB_URL` | `/db` | PocketBase URL as seen by the browser |
| `VITE_SERVER_URL` | `/api` | API server URL as seen by the browser |

::: info
In the Docker image, `VITE_*` variables are injected at runtime via placeholder replacement. You can change them without rebuilding the image.
:::

### PocketBase

| Variable | Default | Description |
|----------|---------|-------------|
| `PB_SUPERUSER_EMAIL` | — | Admin account email (required on first launch) |
| `PB_SUPERUSER_PASSWORD` | — | Admin account password (required on first launch) |

PocketBase provides the database and authentication layer. Access the admin UI at `http://your-host/db/`.

The admin account is created (or updated) at container startup from the environment variables above. If these variables are not set, admin creation is skipped.

### Data Persistence

PocketBase stores its data in `/app/db/pb_data`. When running with Docker, mount a volume to persist data:

```bash
-v melody-manager-db:/app/db/pb_data
```

## Cache

Audio files from external sources (YouTube, SoundCloud, etc.) are cached locally to avoid re-downloading. Configure the cache with:

- **`CACHE_DIR`** — Where to store cached files
- **`CACHE_MAX_FILES`** — Maximum number of files in the cache
- **`CACHE_MAX_SIZE`** — Maximum total size (e.g. `1GB`, `5GB`)

When the cache exceeds its limits, the oldest files are evicted automatically.

## Sources

A source is configured in two halves, which never overlap.

**Server settings** (admin, one row per source type) hold what belongs to the
installation: the local library path, the YouTube download path, the Spotify
application credentials. They also carry a server-wide on/off switch. Their
values are readable by administrators only.

**Connections** (one per user and source type) hold what belongs to a person:
YouTube cookies, a Spotify OAuth token. An empty connection is simply an opt-in,
which is all SoundCloud and Bandcamp need. A user only ever reads their own.

| Source | Server settings | User connection |
|---|---|---|
| Local | `path` (required) | — server library, admin only |
| YouTube | `downloadPath` | opt-in, optional cookies |
| SoundCloud | — | opt-in |
| Bandcamp | — | opt-in |
| Spotify | `clientId` / `clientSecret` | opt-in, OAuth token |
| Sonos | — | — autodiscovered on the local network |

A source is usable when it is enabled server-wide and, for the ones a user can
connect, when that user has an enabled connection for it.

Spotify is a catalogue source: it supplies tracks, albums and playlists, but not
audio, which yt-dlp cannot extract. Playback for a Spotify result is resolved
through a streamable source instead.

## Local Music Library

To make local audio files available, mount a directory containing your music into the container:

```yaml
volumes:
  - /path/to/your/music:/app/music:ro
```

The `:ro` flag mounts read-only, which is recommended since Melody Manager only needs to read the files.
