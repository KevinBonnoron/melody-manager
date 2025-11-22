# Getting Started

Melody Manager is a self-hosted music library manager that aggregates music from multiple providers into a single interface. Stream to your browser or to Sonos speakers on the local network.

## Quick Start with Docker

The fastest way to run Melody Manager:

```bash
docker run -d \
  --name melody-manager \
  -p 80:80 \
  -e PB_SUPERUSER_EMAIL=admin@example.com \
  -e PB_SUPERUSER_PASSWORD=your-secure-password \
  -v melody-manager-db:/app/db/pb_data \
  ghcr.io/kevinbonnoron/melody-manager:latest
```

Then open [http://localhost](http://localhost) in your browser.

::: warning
`PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` are **required** to create the PocketBase admin account on first launch. The admin UI is available at [http://localhost/db/](http://localhost/db/).
:::

## Using Docker Compose

For a more configurable setup, use Docker Compose. Create a `docker-compose.yml`:

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
      # Mount your local music library (optional)
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

volumes:
  melody-manager-db:
    driver: local
```

Then run:

```bash
docker compose up -d
```

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- [FFmpeg](https://ffmpeg.org) (for audio transcoding)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (for YouTube support)

#### With Nix (recommended)

If you use [Nix](https://nixos.org) with flakes, the project includes a `flake.nix` that provides all dependencies:

```bash
# With direnv (automatic)
cd melody-manager   # dependencies are loaded automatically

# Without direnv
nix develop
```

This provides: bun, pocketbase, mailpit, ffmpeg, yt-dlp, nodejs, JDK 21, and gradle.

### Install and Run

```bash
# Install dependencies
bun install

# Start all services in development mode
bun run dev
```

This starts:
- **Client:** Vite dev server (React frontend)
- **Server:** Hono API server with hot reload
- **Database:** PocketBase + Mailpit (for email testing)

### Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all workspaces in dev mode |
| `bun run build` | Build all workspaces |
| `bun run lint` | Lint with Biome |
| `bun run format` | Format with Biome |
| `bun run type-check` | Type check all workspaces |
| `bun run test` | Run tests |

### Running Individual Workspaces

```bash
cd client && bun run dev    # Frontend only
cd server && bun run dev    # API server only
cd db && bun run dev        # Database only
```
