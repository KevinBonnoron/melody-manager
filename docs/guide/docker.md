# Docker

The image is one Go binary in one container, and the binary is the whole
application: PocketBase for the database, the authentication, the realtime
channel and an admin UI, the melody-specific `/api` endpoints, and the built
client compiled in. No reverse proxy, no process manager, no separate database
and no client bundle to keep beside it. What else the image carries is what that
binary shells out to: ffmpeg, yt-dlp and a JavaScript runtime for it.

```
┌──────────────────────────────────────────┐
│            Docker Container              │
│                                          │
│   ┌──────────────────────────────┐       │
│   │   melody-api        :8090    │◄──────┼── everything
│   │                              │       │
│   │   /api/*   melody endpoints  │       │
│   │   /_/*     PocketBase admin  │       │
│   │   /*       the client, built │       │
│   │            into the binary   │       │
│   └──────────────────────────────┘       │
│                                          │
│   ffmpeg · yt-dlp on PATH                │
└──────────────────────────────────────────┘
```

## Compose

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
      - ./config:/config
      # Your music, read-only
      - /path/to/your/music:/music:ro
    restart: unless-stopped

volumes:
  melody-manager-data:
  melody-manager-cache:
```

The image declares its own healthcheck against `/api/health`, so there is none
to write.

To play on a speaker, read [Speakers and devices](/guide/devices) first:
discovery is multicast, and multicast does not cross a bridge network.

## Volumes

| Mount | What is in it |
|---|---|
| `/app/pb_data` | The database, the uploaded covers, the auth keys. Back this one up. |
| `/app/cache` | Audio fetched or transcoded for a speaker. Safe to drop, refills on demand. |
| `/config` | `config.json`, the operator settings. Mounted from the host so it can be read and edited with the server down. |
| `/music` | Your own files, wherever you mount them. `:ro` is enough. |

The image declares all four as volumes, so Docker creates anonymous ones for
anything you do not mount yourself. Anonymous volumes are easy to lose track of;
`pb_data` in particular is worth naming.

## Tags

| Tag | What it points at |
|---|---|
| `latest` | The tip of `main` |
| `1.2.3`, `1.2`, `1` | A release, at three levels of pinning |
| `sha-abc1234` | One exact commit |

Built for `linux/amd64` and `linux/arm64`, so an x86 server and a Raspberry Pi 4
or newer both work.

Only a revision that reached `main` is ever released: the workflow refuses a tag
whose commit is not an ancestor of it.

## Configuration

Operator settings live in `config.json`, not in the environment. The image
points `CONFIG_FILE` at `/config/config.json` and writes the file with its
defaults on first start. See [Configuration](/guide/configuration) for the keys.

Only two environment variables are worth setting in a compose file, and only
before the first start:

```yaml
    environment:
      - PB_SUPERUSER_EMAIL=admin@example.com
      - PB_SUPERUSER_PASSWORD=a-long-password
```

They create the PocketBase superuser, who administers the database at `/_/`.
That is a different thing from the application's own first account, which is
whoever signs up first.

::: warning
`SERVER_URL`, `CACHE_DIR`, `CACHE_MAX_FILES` and `CACHE_MAX_SIZE` used to be
environment variables. They are not read any more. Carry the values over into
`config.json`.
:::

## Networking

One port, `8090`, and the binary serves everything on it. Behind Traefik, Caddy
or nginx, proxy to that port and nothing else.

The entrypoint passes `--http=0.0.0.0:8090`, so the `listenAddr` key has no
effect inside the container.

If you switch to `network_mode: host` for speaker discovery, drop the `ports`
mapping: host mode makes it meaningless, and Compose will complain.

## Building it yourself

```bash
cd docker
docker compose build
docker compose up -d
```

The build runs in stages: the client with Bun, the Go binary with
`CGO_ENABLED=0` so it needs no libc and with the client compiled into it, and a
standalone yt-dlp for the target architecture. The final image is
`debian:bookworm-slim` with ffmpeg, ca-certificates and curl.
