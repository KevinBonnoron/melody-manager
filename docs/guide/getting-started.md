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

## Mobile Apps

Native Android and iOS apps are available. Installation instructions are included in the releases page.
