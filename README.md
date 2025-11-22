# Melody Manager

Self-hosted music library manager with multi-provider support. Aggregate your music from local files, YouTube, Spotify, SoundCloud and Bandcamp into a single interface. Stream to your browser or Sonos speakers.

## Features

- **Multi-provider**: Play music from local files, YouTube, Spotify, SoundCloud and Bandcamp
- **Sonos streaming**: Discover and stream to Sonos speakers on your network with automatic FLAC-to-MP3 transcoding
- **Library management**: Browse by artists, albums and tracks with likes, favorites and search
- **Mobile ready**: PWA support and native Android/iOS apps via Capacitor
- **Internationalization**: English and French
- **Dark mode**: Light and dark themes
- **Docker deployment**: Single-container setup with nginx, PocketBase and the app server

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Server | [Hono](https://hono.dev) |
| Client | [React 19](https://react.dev) + [Vite](https://vitejs.dev) |
| Routing | [TanStack Router](https://tanstack.com/router) (file-based) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Database | [PocketBase](https://pocketbase.io) |
| State | [Zustand](https://zustand.docs.pmnd.rs) |
| Build | [Turbo](https://turbo.build) |
| Mobile | [Capacitor](https://capacitorjs.com) |
| Transcoding | FFmpeg |

## Project Structure

```
melody-manager/
├── client/          # React frontend (Vite, TanStack Router, Tailwind)
├── server/          # Hono API server (streaming, transcoding, metadata)
├── shared/          # Shared TypeScript types
├── db/              # PocketBase database and migrations
└── docker/          # Docker deployment (Dockerfile, nginx, supervisord)
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- [FFmpeg](https://ffmpeg.org) (for audio transcoding)

### Installation

```bash
bun install
```

### Development

```bash
# Start all services (client, server, database)
bun run dev
```

This starts:
- Client on `http://localhost:5173`
- Server on `http://localhost:3000`
- PocketBase on `http://localhost:8090` (admin UI at `http://localhost:8090/_/`)

Default admin credentials: `admin@melody-manager.local` / `changeme123`

### Building

```bash
bun run build
```

### Code Quality

```bash
bun run lint          # Biome linter
bun run format        # Biome formatter
bun run type-check    # TypeScript checks
bun run test          # Tests
```

## Docker

```bash
cd docker
docker compose up -d
```

The app is served on port 80. Mount your music directory by uncommenting the volume in `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/music:/app/music:ro
```

## Sonos

To stream to Sonos speakers, access the app via your machine's local IP (e.g. `http://192.168.x.x:5173`) so Sonos can reach the server. Open the device selector in the player and click "Discover Devices".

FLAC files are automatically transcoded to MP3 320kbps. Other formats (MP3, WAV, AAC, M4A) stream directly.

## License

MIT
