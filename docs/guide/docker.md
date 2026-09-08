# Docker Deployment

The image is a single Go binary in a single container. It embeds PocketBase —
database, auth, admin UI, REST and realtime — serves the melody-specific `/api`
endpoints, and ships the built client as static files. No reverse proxy, no
process manager, no separate database process.

## Architecture

```
┌──────────────────────────────────────────┐
│            Docker Container              │
│                                          │
│   ┌──────────────────────────────┐       │
│   │   melody-api        :8090    │◄──────┼── client requests
│   │                              │       │
│   │   /api/*   melody endpoints  │       │
│   │   /_/*     PocketBase admin  │       │
│   │   /*       client from       │       │
│   │            /app/pb_public    │       │
│   └──────────────────────────────┘       │
│                                          │
│   ffmpeg · yt-dlp on PATH                │
└──────────────────────────────────────────┘
```

## Quick Start

```bash
docker run -d \
  --name melody-manager \
  -p 8090:8090 \
  -e PB_SUPERUSER_EMAIL=admin@example.com \
  -e PB_SUPERUSER_PASSWORD=your-secure-password \
  -v melody-manager-data:/app/pb_data \
  -v melody-manager-cache:/app/cache \
  ghcr.io/kevinbonnoron/melody-manager:latest
```

## Docker Compose

```yaml
services:
  melody-manager:
    image: ghcr.io/kevinbonnoron/melody-manager:latest
    container_name: melody-manager
    ports:
      - "8090:8090"
    volumes:
      - melody-manager-data:/app/pb_data
      - melody-manager-cache:/app/cache
      # Mount local music (optional)
      # - /path/to/your/music:/music:ro
    environment:
      - SERVER_URL=http://localhost:8090
      - PB_SUPERUSER_EMAIL=admin@example.com
      - PB_SUPERUSER_PASSWORD=your-secure-password
      - CACHE_MAX_FILES=500
      - CACHE_MAX_SIZE=5GB
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8090/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  melody-manager-data:
    driver: local
  melody-manager-cache:
    driver: local
```

## Building from Source

```bash
cd docker
docker compose build
docker compose up -d
```

The Dockerfile builds in stages: the client with Bun, the Go binary with
`CGO_ENABLED=0` (PocketBase uses the pure-Go SQLite driver), and a standalone
yt-dlp for the target architecture. The final image is `debian:bookworm-slim`
with ffmpeg, ca-certificates and curl.

## Volumes

| Mount | Purpose |
|-------|---------|
| `melody-manager-data:/app/pb_data` | Database, uploaded covers, auth keys — required for persistence |
| `melody-manager-cache:/app/cache` | Cached audio from remote sources — safe to drop, refills on demand |
| `/path/to/music:/music:ro` | Local music library (optional), then point the local source at it |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_URL` | `http://localhost:8090` | Public URL of this server. Sonos speakers fetch stream URLs themselves, so it must be reachable from them |
| `PB_SUPERUSER_EMAIL` | — | Bootstraps a PocketBase superuser on first run |
| `PB_SUPERUSER_PASSWORD` | — | Password for that superuser |
| `REGISTRATION_DISABLED` | `false` | Refuses new sign-ups; the first user can always register |
| `CACHE_DIR` | `/app/cache` | Where cached audio is stored |
| `CACHE_MAX_FILES` | `500` | Maximum number of cached files |
| `CACHE_MAX_SIZE` | `5GB` | Maximum total cache size (`512MB`, `5GB`, or a byte count) |

The client is served from the same origin as the API, so it needs no build-time
or runtime URL configuration.

## Networking

The container exposes a single port, `8090`, and the binary serves everything on
it: `/api/*`, the PocketBase admin UI under `/_/*`, and the client for any other
path. Behind a reverse proxy (Traefik, Caddy, nginx), proxy to that port.

## Health Check

`GET /api/health` returns `200 OK` once the server is up; the image declares it
as its healthcheck.

## Multi-Platform Support

The image is built for `linux/amd64` and `linux/arm64` in CI, so it runs on x86
servers and on ARM devices (Raspberry Pi 4+, Apple Silicon).
