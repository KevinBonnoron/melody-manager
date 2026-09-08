# Melody Manager

Self-hosted music library manager with multi-provider support. Aggregate your music from local files, YouTube, Spotify, SoundCloud and Bandcamp into a single interface. Stream to your browser or Sonos speakers.

## Features

- **Multi-provider**: Play music from local files, YouTube, Spotify, SoundCloud and Bandcamp
- **Sonos streaming**: Discover and stream to Sonos speakers on your network with automatic FLAC-to-MP3 transcoding
- **Library management**: Browse by artists, albums and tracks with likes, favorites and search
- **Mobile ready**: PWA support and native Android/iOS apps via Capacitor
- **Internationalization**: English and French
- **Dark mode**: Light and dark themes
- **Docker deployment**: A single container running one Go binary (embedded PocketBase)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | [Go](https://go.dev) + embedded [PocketBase](https://pocketbase.io) (DB, auth, REST, realtime, admin UI) |
| Client | [React 19](https://react.dev) + [Vite](https://vitejs.dev) |
| Routing | [TanStack Router](https://tanstack.com/router) (file-based) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| State | [Zustand](https://zustand.docs.pmnd.rs) |
| Tasks | [Task](https://taskfile.dev) |
| Mobile | [Capacitor](https://capacitorjs.com) |
| Media tools | FFmpeg + yt-dlp |

## Project Structure

```
melody-manager/
├── api/             # Go backend: embedded PocketBase + /api routes, providers, services
├── client/          # React frontend (Vite, TanStack Router, Tailwind)
├── shared/          # Shared TypeScript types (client)
└── docker/          # Single-container Dockerfile + compose
```

## Getting Started

### Prerequisites

The repo ships a Nix dev shell (with `direnv` `use flake`) providing Go, Bun, Task, FFmpeg and yt-dlp. Either `direnv allow` or run commands through `nix develop`.

### Development

```bash
task dev
```

This runs the Go backend and the Vite client together:
- Client on `http://localhost:5173`
- API + PocketBase on `http://localhost:8090` (admin UI at `http://localhost:8090/_/`)

The first registered user automatically becomes an admin. To create a PocketBase superuser:

```bash
task superuser -- admin@example.com 'your-password'
```

See `task --list` for all tasks (`api`, `client`, `build`, `lint`, `format`, `type-check`, `test`).

## Docker

```bash
cd docker
docker compose up -d
```

One container serves everything on port `8090` (client, API, PocketBase, admin UI). Persist data via the `pb_data` volume and point the local provider at a mounted music directory (uncomment the volume in `docker-compose.yml`).

## Sonos

To stream to Sonos speakers, access the app via your machine's local IP so the speakers can reach the server, and set `SERVER_URL` accordingly. FLAC files are transcoded to MP3 320kbps; other formats stream directly.

## License

MIT
