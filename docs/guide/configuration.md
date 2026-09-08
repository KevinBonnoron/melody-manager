# Configuration

Melody Manager is configured through environment variables and PocketBase settings.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_URL` | `http://localhost:8090` | Public URL of this server. Sonos speakers fetch stream URLs themselves, so it must be reachable from them |
| `CACHE_DIR` | `/app/cache` | Directory for cached audio files |
| `CACHE_MAX_FILES` | `500` | Maximum number of cached files |
| `CACHE_MAX_SIZE` | `5GB` | Maximum total cache size |
| `PB_SUPERUSER_EMAIL` | — | Bootstraps a PocketBase superuser on first run |
| `PB_SUPERUSER_PASSWORD` | — | Password for that superuser |
| `REGISTRATION_DISABLED` | `false` | Refuses new sign-ups; the first user can always register |

The client is served from the same origin as the API, so it needs no URL
configuration of its own.

### PocketBase

PocketBase runs inside the server binary and provides the database and
authentication layer. Its admin UI is at `http://your-host/_/`.

The superuser is created (or updated) at startup from the variables above; if
they are unset, the step is skipped and the first user to register becomes the
administrator.

### Data Persistence

The database, uploaded covers and auth keys live in `/app/pb_data`. When running
with Docker, mount a volume to persist them:

```bash
-v melody-manager-data:/app/pb_data
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
