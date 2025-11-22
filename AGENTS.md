# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Melody Manager is a self-hosted music library manager that aggregates music from multiple providers (local files, YouTube, Spotify, SoundCloud, Bandcamp) into a single interface. It supports streaming to the browser or to Sonos speakers on the local network, with automatic FLAC-to-MP3 transcoding.

Full-stack TypeScript monorepo using Bun as the runtime, Hono for the API, React + Vite for the client, PocketBase for the database, and Turbo for build orchestration. The client also ships as a PWA and as native Android/iOS apps via Capacitor.

## Common Development Commands

### Development
```bash
# Run all workspaces in dev mode
bun run dev

# Run individual workspaces
cd client && bun run dev    # Vite dev server on default port
cd server && bun run dev    # Hono server with --watch
cd db && bun run dev        # PocketBase + Mailpit
```

### Building
```bash
# Build all workspaces
bun run build

# Build individual workspaces
cd client && bun run build  # TypeScript check + Vite build
cd server && bun run build  # TypeScript compile
cd shared && bun run build  # TypeScript compile (if build script exists)
```

### Code Quality
```bash
# Lint with Biome
bun run lint

# Format with Biome
bun run format

# Type check all workspaces
bun run type-check

# Run tests
bun run test
```

### Database (PocketBase)
```bash
# Migrate collections
cd db && bun run migrate:collections

# Dev credentials (auto-created):
# Email: admin@melody-manager.local
# Password: changeme123
# Admin UI: http://localhost:8090/_/
# API: http://localhost:8090

# Mailpit (for email testing):
# UI: http://localhost:8025
# SMTP: smtp://localhost:1025
```

## Architecture

### Monorepo Structure

The project is a Bun workspaces monorepo with six main areas:

- **`client/`**: React frontend with Vite, TanStack Router, and Capacitor for mobile
- **`server/`**: Hono backend API (streaming, transcoding, metadata, sources)
- **`shared/`**: Shared TypeScript types used by both client and server
- **`plugins/`**: Plugin packages (e.g. `plugins/youtube`) and shared SDK (`plugins/sdk`)
- **`db/`**: PocketBase database layer with auto-download and migration scripts
- **`docker/`**: Production deployment (Dockerfile, nginx, supervisord)

### Workspace Dependencies

- `client` depends on `@melody-manager/shared`
- `server` depends on `@melody-manager/shared`, `@melody-manager/plugin-sdk`
- `shared` has no internal dependencies (base package)
- `plugins/sdk` depends on `@melody-manager/shared`
- Each plugin (e.g. `plugins/youtube`) depends only on `@melody-manager/plugin-sdk` and `@melody-manager/shared` — **never on the server**
- `db` is independent (runs PocketBase)

### Type Sharing

Types are shared via the `shared` workspace. The shared package exports from `src/index.ts` which re-exports from `src/types/`.

Import shared types as:
```typescript
// In client or server
import { ApiResponse } from '@melody-manager/shared'
// or from the compiled dist
import type { ApiResponse } from 'shared/dist'
```

### Database (PocketBase)

- PocketBase binary is auto-downloaded if missing when running `bun run dev` in the `db/` workspace
- Auto-generated TypeScript types are available at `db/pocketbase/pb_data/types.d.ts`
- Superuser account is auto-created on first run

### Client Architecture

- **Router**: TanStack Router with file-based routing in `src/routes/`
- **Styling**: Tailwind CSS v4 with @tailwindcss/vite plugin
- **UI Components**: Custom components in `src/components/ui/` (shadcn/ui style)
- **State**: Zustand for music player state (`src/contexts/music-player-context.tsx`)
- **i18n**: i18next with English and French locales in `src/i18n/locales/`
- **Mobile**: Capacitor for Android/iOS builds, PWA via vite-plugin-pwa
- **Path Alias**: `@/` maps to `src/`
- **Route Tree**: Auto-generated at `src/routeTree.gen.ts` by TanStack Router plugin

Key Vite plugins order (important):
1. `@tanstack/router-plugin` (must be first)
2. `@vitejs/plugin-react`
3. `@tailwindcss/vite`

### Server Architecture

- **Framework**: Hono with CORS middleware
- **Runtime**: Bun with `--watch` flag for hot reload
- **Entry**: `src/index.ts` loads plugins then creates the Hono app
- **Sources** (`src/sources/`): Legacy provider logic (local, YouTube, Spotify, SoundCloud, Bandcamp) when no plugin is used
- **Stream Handlers** (`src/stream-handlers/`): Provider-specific audio streaming (e.g. SoundCloud)
- **Metadata Sources** (`src/metadata-sources/`): Metadata extraction (MusicBrainz, Spotify, Bandcamp, etc.)
- **Services** (`src/services/`): Business logic; transcoding, cache, yt-dlp are implemented in plugin-sdk and instantiated here
- **Streaming endpoint**: `/api/tracks/stream/:id?transcode=mp3`

### Plugin Architecture

Plugins extend the server with new providers (search, stream, import) without depending on the server or the database.

**Principles**

- Plugins **only provide data** (search results, track data for import). The **server** is responsible for persistence (repos, metadata enrichment). Plugins do not access repositories or the DB.
- Plugins depend only on `@melody-manager/plugin-sdk` and `@melody-manager/shared`. They never import from `@melody-manager/server`.
- Shared logic (ffmpeg, cache, transcode, yt-dlp, types) lives in the **plugin SDK**; both the server and the plugins use it.

**Plugin SDK (`plugins/sdk`)**

- **Types**: `PluginImportTrack`, `PluginStreamDeps`, `StreamOptions`, `SearchProvider`, `ImportProvider`, `StreamProvider`, `MelodyPlugin`, `PluginManifest`, etc.
- **Implementations**: `ffmpeg`, `CacheService`, `TranscodeService`, `YtDlpService`, cookies util, logger.
- **`PluginImportTrack`**: Shape of track data returned by a plugin for import (title, duration, sourceUrl, artistName, albumName, coverUrl?, metadata?, genreNames?). The server converts these to DB entities via `persistImportTracks`.
- **`PluginStreamDeps`**: Dependencies needed for streaming (ffmpeg, cacheService, transcodeService, ytDlpService). The server injects these when instantiating the plugin.

**Plugin structure (e.g. `plugins/youtube`)**

- `package.json`: dependencies `@melody-manager/plugin-sdk`, `@melody-manager/shared`, `hono` (no server).
- `manifest.json`: id, name, entry, features (`search` | `stream` | `import`), searchTypes, importTypes, configSchema.
- **Entry** (e.g. `src/index.ts`): Exports a **class** (e.g. `YoutubePlugin`), not an instance.
- **Constructor**: `constructor(deps: PluginStreamDeps)`. The server passes stream deps when loading; the plugin uses them for search (ytDlpService), stream (ffmpeg, cache, transcode, ytDlp), and building import data (ytDlpService).
- **SearchProvider**: `search(query, type, provider)` → `Promise<SearchResult[]>`.
- **ImportProvider**: `getTracks`, `getAlbumTracks`, etc. return `Promise<PluginImportTrack[]>` (data only). Server calls `persistImportTracks(provider, importTracks)` to create artists/albums/tracks and run metadata enrichment.
- **StreamProvider** (optional): `stream(c, options)` → `Promise<Response>`, using the injected `PluginStreamDeps`.

**Server plugin loading**

- `server/src/plugins/loader.ts`: Scans `plugins/` (sibling of server), reads each `manifest.json`, loads the entry, instantiates with `new PluginClass(streamDeps)` where `streamDeps` is built from server services (ffmpeg from SDK, cacheService, transcodeService, ytDlpService from server).
- `server/src/services/import-persist.service.ts`: `persistImportTracks(provider, importTracks)` creates artists, albums, genres, tracks in the DB and runs metadata enrichment (e.g. YouTube); returns `Track[]`.
- `server/src/services/track-source.service.ts`: For plugin-based import, calls the plugin’s getTracks/getAlbumTracks/etc., then `persistImportTracks`, and returns `Track[]`.

**Key files**

- `plugins/sdk/src/` — types, ffmpeg, cache.service, transcode.service, yt-dlp.util, cookies, logger, manifest types
- `plugins/youtube/` — example plugin (search + stream + import)
- `server/src/plugins/loader.ts` — discover and load plugins, inject streamDeps
- `server/src/plugins/registry.ts` — register and resolve plugins by provider
- `server/src/services/import-persist.service.ts` — persist `PluginImportTrack[]` to DB

### Code Style

- **Formatter**: Biome (tab indentation, double quotes)
- **Linter**: Biome with recommended rules
- **Auto-organize imports**: Enabled via Biome assist
- **Git Hooks**: Lefthook (currently template only, not configured)
- **Comments Policy**:
  - Always write comments in English
  - Avoid unnecessary comments - code should be self-explanatory
  - Only add comments when the logic is truly non-obvious or requires context
  - Do not add redundant comments that simply restate what the code does

### DevContainer

The project includes a devcontainer setup with:
- Biome extension
- Claude Code feature
- Post-create command: `bunx lefthook install`
- FFmpeg for audio transcoding (Sonos FLAC support)

### Build Orchestration (Turbo)

All tasks use Turbo for caching and parallelization. Key task dependencies:
- `build`: Depends on `^build` (builds dependencies first)
- `lint`, `type-check`, `test`: All depend on `^build`
- `dev`: No caching, runs persistently

Environment variables starting with `VITE_*` are passed through to build and dev tasks.

## Sonos Integration

The application supports streaming audio to Sonos devices on the local network. FLAC files are automatically transcoded to MP3 320kbps on-the-fly for Sonos compatibility. Other formats (MP3, WAV, AAC, M4A) stream directly.

### Technical Details

- **Protocol**: Uses UPnP/SOAP with DIDL-Lite metadata
- **Network**: DevContainer uses `--network=host` for proper network access
- Access the app via local IP (not localhost) so Sonos can reach the server

### Implementation Files

- `server/src/services/sonos.service.ts` - Sonos device discovery and control
- `server/src/routes/track.route.ts` - Audio streaming with optional transcoding
- `server/src/routes/device.route.ts` - Device management API
- `client/src/components/atoms/music-player/device-selector.tsx` - Device selection UI
