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

## Local Music Library

To make local audio files available, mount a directory containing your music into the container:

```yaml
volumes:
  - /path/to/your/music:/app/music:ro
```

The `:ro` flag mounts read-only, which is recommended since Melody Manager only needs to read the files.
