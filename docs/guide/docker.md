# Docker Deployment

The Docker image bundles everything into a single container: nginx (reverse proxy + static files), Hono API server, and PocketBase database. Managed by supervisord.

## Architecture

```
┌─────────────────────────────────────┐
│           Docker Container          │
│                                     │
│  ┌─────────┐  :80                   │
│  │  nginx   │◄─── client requests   │
│  └────┬─────┘                       │
│       │                             │
│       ├── /api/* ──► Hono  :3000    │
│       ├── /db/*  ──► PocketBase     │
│       ├── /_/*   ──► :8090          │
│       └── /*     ──► static files   │
│                                     │
│  ┌────────────┐  ┌──────────────┐   │
│  │ Hono API   │  │  PocketBase  │   │
│  │ port 3000  │  │  port 8090   │   │
│  └────────────┘  └──────────────┘   │
└─────────────────────────────────────┘
```

## Quick Start

```bash
docker run -d \
  --name melody-manager \
  -p 80:80 \
  -e PB_SUPERUSER_EMAIL=admin@example.com \
  -e PB_SUPERUSER_PASSWORD=your-secure-password \
  -v melody-manager-db:/app/db/pb_data \
  ghcr.io/kevinbonnoron/melody-manager:latest
```

## Docker Compose

```yaml
version: '3.8'

services:
  melody-manager:
    image: ghcr.io/kevinbonnoron/melody-manager:latest
    container_name: melody-manager
    ports:
      - "80:80"
    volumes:
      - melody-manager-db:/app/db/pb_data
      # Mount local music (optional)
      # - /path/to/your/music:/app/music:ro
    environment:
      - PB_SUPERUSER_EMAIL=admin@example.com
      - PB_SUPERUSER_PASSWORD=your-secure-password
      - NODE_ENV=production
      - CACHE_DIR=/tmp/melody-manager-cache
      - CACHE_MAX_FILES=500
      - CACHE_MAX_SIZE=5GB
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M

volumes:
  melody-manager-db:
    driver: local
```

## Building from Source

```bash
cd docker
docker compose build
docker compose up -d
```

The Dockerfile uses a multi-stage build:
1. Downloads PocketBase and yt-dlp binaries (platform-aware for amd64/arm64)
2. Extracts Bun runtime
3. Builds on nginx:bookworm with ffmpeg and supervisord

## Volumes

| Mount | Purpose |
|-------|---------|
| `melody-manager-db:/app/db/pb_data` | PocketBase database (required for persistence) |
| `/path/to/music:/app/music:ro` | Local music library (optional) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PB_SUPERUSER_EMAIL` | — | PocketBase admin email (required on first launch) |
| `PB_SUPERUSER_PASSWORD` | — | PocketBase admin password (required on first launch) |
| `NODE_ENV` | `production` | Runtime environment |
| `PORT` | `3000` | API server port (internal) |
| `PB_URL` | `http://localhost:8090` | PocketBase URL (internal) |
| `VITE_PB_URL` | `/db` | PocketBase URL for the client |
| `VITE_SERVER_URL` | `/api` | API URL for the client |
| `CACHE_DIR` | `/tmp/melody-manager-cache` | Audio cache directory |
| `CACHE_MAX_FILES` | `500` | Max cached files |
| `CACHE_MAX_SIZE` | `5GB` | Max cache size |

::: tip Runtime Configuration
`VITE_*` variables are injected at container startup via placeholder replacement in the built JS/HTML files. No rebuild needed to change client configuration.
:::

## Networking

The container exposes a single port (80). Nginx handles routing:

- `/api/*` → Hono API server (port 3000)
- `/db/*` and `/_/*` → PocketBase (port 8090)
- `/*` → Static files (SPA with fallback to `index.html`)

### Using a Reverse Proxy

If running behind a reverse proxy (Traefik, Caddy, nginx), simply proxy to port 80 of the container. If the app is served on a subpath, set `VITE_PB_URL` and `VITE_SERVER_URL` accordingly.

## Health Check

The container exposes a health check at `/health` that returns `200 OK` when nginx is up.

## Multi-Platform Support

The Docker image is built for both `linux/amd64` and `linux/arm64` via GitHub Actions, so it runs natively on x86 servers and ARM devices (Raspberry Pi 4+, Apple Silicon).
