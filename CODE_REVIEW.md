# Code Review - Melody Manager

**Date:** 2026-03-13
**Branch:** `claude/code-review-analysis-h0eMq`

---

## Summary

Full codebase review covering the client, server, shared types, plugins, and configuration.
**Totals: 12 bugs, 18 dead code, 17 duplications, 13 inconsistencies, 13 code smells, 7 config issues, 5 type safety issues.**

Findings are organized by category with severity indicators.

- **BUG** = likely correctness issue
- **DEAD** = unused code that can be removed
- **SMELL** = code smell / maintainability concern
- **INCONSISTENCY** = same thing done differently in different places
- **CONFIG** = build/dependency/configuration issue

---

## 1. Bugs & Correctness Issues

### BUG-1: Shuffle is non-functional
- **File:** `client/src/contexts/music-player-context.tsx`
- `toggleShuffle` toggles the state boolean, and the UI renders a shuffle button. But `playNext` and `playPrevious` never check `playerState.shuffle`. The shuffle feature does nothing.

### BUG-2: `supportsSearchType` returns `true` for unknown plugins
- **File:** `server/src/plugins/registry.ts:56-65`
- When capabilities are `undefined` (plugin not found) or `search` is `undefined`, the method returns `true`. Unregistered or misconfigured plugins are treated as supporting all search types.

### BUG-3: Incorrect tuple type for `transcodeFormats`
- **File:** `shared/src/configs/transcode.config.ts:20`
- `Object.keys(transcodeConfigs)` is cast as `[keyof typeof transcodeConfigs]` (a 1-element tuple). Should be `(keyof typeof transcodeConfigs)[]` (an array). The current type incorrectly says the array always has exactly one element.

### BUG-4: `TrackCard` unsafe destructure without null check
- **File:** `client/src/components/tracks/track-card.tsx:19`
- `const { album, artists, provider, genres } = track.expand;` destructures without checking if `expand` exists. Other components consistently use `track.expand?.artists`, etc. This will throw at runtime if `expand` is undefined.

### BUG-5: `NativeAudioService.initialize` ignores callback updates after first call
- **File:** `client/src/services/native-audio.service.ts:24-28`
- If `initPromise` already exists, `initialize()` returns without updating `this.callbacks`. But `music-player-context.tsx` calls `initialize()` on every track change with fresh callbacks containing closures over current state. After the first initialization, stale callbacks will be used.

### BUG-6: Duplicate `CreateDto` / `UpdateDto` with different semantics
- **Files:** `shared/src/types/dto.type.ts:1-2` vs `shared/src/types/pocketbase.type.ts:15-16`
- `dto.type.ts`: `CreateDto<T> = Omit<T, 'id' | 'created' | 'updated'>`
- `pocketbase.type.ts`: `CreateDto<T> = Omit<T, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>`
- Only `dto.type.ts` is re-exported. The two definitions omit different keys, which is confusing and a latent bug if someone accidentally imports the wrong one.

### BUG-7: Unreachable fallback in `normalizeTrackTitle`
- **File:** `shared/src/utils/title.util.ts:10-15`
- The `if (!normalized && title.trim())` block checks for patterns like `' - '` at the start of the trimmed string. But `trimmed.startsWith(' - ')` can never be true because `trim()` removes leading spaces. This fallback block is unreachable dead code.

### BUG-8: SQL injection via string interpolation
- **Files:** Multiple server services and repositories
- PocketBase filter queries are built with string interpolation: `\`name = "${result.name}"\``, `\`sourceUrl = "${t.sourceUrl}"\``, etc. While some calls use `.replace(/"/g, '\\"')`, many don't. If user-controlled data reaches these queries (e.g. search terms, URLs), this is exploitable.
- Examples: `search.service.ts:56`, `search.service.ts:88`, `search.service.ts:120`, `track.route.ts:26`, `device-source.service.ts` (track data)

### BUG-9: `addTrackToQueue` uses raw IDs instead of expanded data
- **File:** `server/src/services/device-source.service.ts:205`
- `artist: track.artists.join(', ')` joins artist **IDs** (not names) into a string. Compare with `playTrack` at line 113 which correctly uses `track.expand.artists.map(artist => artist.name).join(', ')`.

### BUG-10: Missing JSON parse error handling in SSE client
- **File:** `client/src/clients/tasks.client.ts:15-18`
- `JSON.parse(data)` is called without try-catch. If the server sends malformed data, the entire SSE handler will throw.

### BUG-11: `getEnvOrDefault<T>` casts env strings to non-string types
- **File:** `server/src/lib/config.ts:3-5`
- `return (process.env[name] as T) || defaultValue` casts an env var string to `T`. For `CACHE_MAX_FILES` and `CACHE_MAX_SIZE` (which expect `number`), a set env var like `"500"` will be returned as a string despite being typed as `number`. The `||` fallback only works when the env var is unset.

### BUG-12: `notifyListeners` is async but called without `await`
- **File:** `server/src/services/device-source.service.ts:75,120,127,134,141`
- `notifyListeners` is async (awaits `getKnownDevices` internally) but called without `await` in multiple places. Errors inside it are unhandled and device state notifications may fire out of order.

---

## 2. Dead / Unused Code

### DEAD-1: `TrackLikeCell` component never imported
- **File:** `client/src/components/albums/table/track-like-cell.tsx`
- Exported but never used. `AlbumTable` uses `TrackActionsCell` for like/dislike instead.

### DEAD-2: `genreCollection` never imported
- **File:** `client/src/collections/genre.collection.ts`
- Defined and exported but no hook or component uses it.

### DEAD-3: `searchClient.searchTracks` and `searchClient.searchLibrary` never called
- **File:** `client/src/clients/search.client.ts:16-17`
- Only `searchClient.search` is used.

### DEAD-4: `PageHeader` component never imported
- **File:** `client/src/components/atoms/page-header.tsx`
- Page headers are constructed inline in `app-layout.tsx` instead.

### DEAD-5: Unused UI component files (never imported by any non-UI file)
- `client/src/components/ui/inline-edit.tsx`
- `client/src/components/ui/toggle.tsx`
- `client/src/components/ui/tabs.tsx`
- `client/src/components/ui/accordion.tsx`
- `client/src/components/ui/input-group.tsx`

### DEAD-6: `use-mobile.ts` is a pointless re-export
- **File:** `client/src/hooks/use-mobile.ts`
- Contains only `export { useIsMobile } from './use-is-mobile';`. Only `sidebar.tsx` imports from it. The indirection serves no purpose.

### DEAD-7: Unused `Playlist` type
- **File:** `shared/src/types/playlist.type.ts`
- Exported but never imported anywhere. Also uses a different pattern (`id`, `createdAt`, `updatedAt` strings instead of extending `PocketBaseRecord`).

### DEAD-8: Entire `ffmpeg/options/map.ts` module is dead code
- **File:** `plugins/sdk/src/ffmpeg/options/map.ts`
- Exports 5 functions. None are imported or used anywhere in the codebase.

### DEAD-9: Unused FFmpeg types
- **File:** `plugins/sdk/src/ffmpeg/options/codec.ts`
- `VideoPreset`, `VpxPreset`, `EncodingPreset`, `Bitrate`, `AudioCodecOptions`, `VideoCodecOptions` are all exported but never used outside this file.

### DEAD-10: `AudioFilterType` never used
- **File:** `plugins/sdk/src/ffmpeg/options/audio-filters.ts:46`

### DEAD-11: `MetadataOptions` and `serializeMetadata` unused externally
- **File:** `plugins/sdk/src/ffmpeg/options/metadata.ts`
- Wired internally but no plugin or server code calls them.

### DEAD-12: `detectSilenceBoundaries` and `SilenceBoundaries` never used
- **File:** `server/src/utils/audio.util.ts:3-69`
- Only `detectAllSilenceRegions` is imported elsewhere.

### DEAD-13: `pocketbase.type.ts` not re-exported from barrel
- **File:** `shared/src/types/index.ts`
- `PocketBaseRecord` and `Expand` are foundational types used by every domain entity, but consumers cannot access them from the shared package.

### DEAD-14: `peaksService.invalidate()` never called
- **File:** `server/src/services/peaks.service.ts:27-29`
- The `invalidate` method exists but is never invoked anywhere.

### DEAD-15: `TaskService.cleanup()` never called
- **File:** `server/src/services/task.service.ts:53-59`
- Defined but never scheduled or invoked. Tasks accumulate in memory indefinitely.

### DEAD-16: `DeviceSourceService.stopAutoDiscovery()` never called
- **File:** `server/src/services/device-source.service.ts:26-31`
- No code path ever stops auto-discovery.

### DEAD-17: Unused re-exports from `server/src/types/index.ts`
- Re-exports `StreamInfo`, `YtDlpChapter`, `YtDlpComment`, `YtDlpTrackInfo` from `@melody-manager/plugin-sdk`. None are imported from `../types` anywhere in the server code.

### DEAD-18: Unused re-exports from `server/src/plugins/index.ts`
- Re-exports `ConfigSchemaItem`, `PluginManifest`, `ImportProvider`, `PluginCapabilities`, `SearchProvider`, `SourcePlugin`. None are imported from `../plugins` by any file outside the plugins directory.

---

## 3. Duplicated Logic

### DUP-1: `getInitials` function duplicated 3 times
- `client/src/components/layout/app-sidebar.tsx:47-53`
- `client/src/components/layout/bottom-nav.tsx:16-22`
- `client/src/components/profile/profile-page.tsx:36-42`
- All three are identical implementations.

### DUP-2: `isActive` route-matching function duplicated
- `client/src/components/layout/app-sidebar.tsx:40-45`
- `client/src/components/layout/bottom-nav.tsx:25-30`

### DUP-3: `avatarUrl` construction duplicated 3 times
- `client/src/components/layout/app-sidebar.tsx:56`
- `client/src/components/layout/bottom-nav.tsx:14`
- `client/src/components/profile/profile-page.tsx:34`

### DUP-4: Provider color mapping in 3 independent places
- `client/src/lib/utils.ts:32-60` (`getProviderColor()`, `getProviderColorContrast()`)
- `client/src/components/providers/provider-type-colors.ts:1-18` (`getProviderTypeColors()`)
- `client/src/components/providers/track-provider-filter.tsx:43-48` (`colorStyles` inline)
- These will drift when new providers are added.

### DUP-5: `formatDuration` defined twice with behavioral divergence
- `client/src/lib/utils.ts:8-30` (canonical, handles hours)
- `client/src/components/atoms/music-player/queue-sheet.tsx:16-19` (local re-implementation, does NOT handle hours)
- For tracks > 60 minutes, these produce different output.

### DUP-6: `providerIdsByAlbum` computation duplicated
- `client/src/components/albums/albums-page.tsx:14-24`
- `client/src/components/favorites/favorites-page.tsx:33-43`

### DUP-7: `providerIdsByArtist` computation duplicated
- `client/src/components/artists/artist-list-page.tsx:14-26`
- `client/src/components/favorites/favorites-page.tsx:45-57`

### DUP-8: Column-count-from-screen-width logic duplicated
- `client/src/components/tracks/track-grid.tsx:35-52`
- `client/src/components/artists/artist-grid.tsx:17-33`
- Identical `useEffect` + `useState` breakpoint logic with the same thresholds.

### DUP-9: `getValidStreamUrl` logic duplicated across 3 plugins
- `plugins/youtube/src/index.ts:124-133`
- `plugins/soundcloud/src/index.ts` (identical pattern)
- `plugins/bandcamp/src/index.ts:153-161`
- All three: call `ytDlpService.getStreamUrl`, probe with `fetch(url, { method: 'HEAD' })`, if not ok then `invalidateStreamUrl` and retry. This belongs in the SDK.

### DUP-10: Track-building/metadata logic repeated 3 times in Bandcamp plugin
- `plugins/bandcamp/src/index.ts`: `getTracks`, `getAlbumTracks`, `getArtistTracks` all contain identical track-to-`PluginImportTrack` mapping logic.

### DUP-11: `cleanTitle` function duplicated
- `plugins/youtube/src/index.ts:340-348`
- `plugins/sdk/src/yt-dlp.util.ts:264-272`
- Both perform the same track-number stripping and title normalization.

### DUP-12: Stale localPath cleaning logic duplicated
- `server/src/index.ts:12-27` (startup cleanup)
- `server/src/services/album.service.ts:48-55` (download pre-check)
- Same existsSync + update logic.

### DUP-13: Transcoding stream handler copy-pasted 3 times
- `server/src/services/stream.service.ts`: `serveFile` (lines 69-81), `serveCached` (lines 189-201), and `proxyUrl` (lines 249-261) all have identical FFmpeg transcoding blocks with the same error logging pattern.

### DUP-14: Range request handling duplicated
- `server/src/services/stream.service.ts`: `serveFile` (lines 89-109) and `serveCached` (lines 208-228) contain near-identical range request parsing and response construction.

### DUP-15: MIME type lookup maps duplicated
- `server/src/services/stream.service.ts:15-23` (`MIME_TYPES`)
- `server/src/utils/stream-url.util.ts:21-28` (`formatToMime`)
- Both define the same mapping from audio format extensions to MIME types.

### DUP-16: `PlayOptions` construction duplicated (with bug)
- `server/src/services/device-source.service.ts`: `playTrack` (lines 109-116) and `addTrackToQueue` (lines 201-208) build the same `PlayOptions` object but `addTrackToQueue` uses raw IDs instead of expanded names (see BUG-9).

### DUP-17: `discoverDevices` and `getKnownDevices` near-identical
- `server/src/services/device-source.service.ts:62-78` vs `80-92`
- Both fetch providers, map with `getDeviceProvider`, and flatten results. Only differ by which plugin method is called.

---

## 4. Inconsistent Patterns

### INCONSISTENCY-1: Form handling: TanStack Form vs raw state
- `LoginForm` uses `useAppForm` (TanStack Form with Zod validation and reusable field components).
- `RegisterForm`, `ResetPasswordForm`, and `ProfilePage` all use raw `useState` with manual validation.
- The form abstraction was built but is only used in one place.

### INCONSISTENCY-2: Hardcoded English strings in i18n-capable components
- Most of the app uses `useTranslation()` with `t()` calls.
- The entire music player component tree (`play-button.tsx`, `next-button.tsx`, `previous-button.tsx`, `repeat-button.tsx`, `shuffle-button.tsx`, `mute-button.tsx`, `mobile-settings.tsx`) has hardcoded English strings.
- Also hardcoded: `play-album-button.tsx`, `like-button.tsx`, `dislike-button.tsx`, `setup-page.tsx`, `track-provider-cell.tsx`, `add-music-dialog.tsx`.

### INCONSISTENCY-3: Query filtering inconsistency for likes
- `use-track-likes.ts:11`: Filters by `.where(({ trackLikes }) => eq(trackLikes.user, user.id))`
- `use-album-likes.ts:10`: No user filter
- `use-artist-likes.ts:9`: No user filter
- Either the server already filters for albums/artists (making the track filter redundant) or album/artist likes are missing a required filter.

### INCONSISTENCY-4: `Genre` type uses `RecordModel` while all others use `PocketBaseRecord`/`Expand`
- **File:** `shared/src/types/genre.type.ts:1`
- Every other domain type uses the project's own `PocketBaseRecord`/`Expand`.

### INCONSISTENCY-5: `Track` re-declares inherited fields
- **File:** `shared/src/types/track.type.ts:34-45`
- `Track` extends `Expand<...>` (which provides `id`, `created`, `updated`) but also explicitly declares `id: string`, `created: string`, `updated: string` again. No other domain type does this.

### INCONSISTENCY-6: Service construction patterns
- `artistService` = plain `databaseServiceFactory(artistRepository)` (no extra methods)
- `albumService` = `databaseServiceFactory(albumRepository, { ... })` (object literal with extra methods)
- `trackService` = same pattern as album
- `searchService` = standalone `class SearchService` (no factory)
- `streamService` = standalone `class StreamService`
- `deviceSourceService` = standalone `class DeviceSourceService`
- `importPersistService` = plain object literal `{ persistImportTracks: ... }`
- No consistent pattern for when to use the factory vs a class vs an object literal.

### INCONSISTENCY-7: Plugin logging: `console.*` vs logger
- `plugins/spotify/`, `plugins/youtube/`, `plugins/soundcloud/`, `plugins/bandcamp/` use `console.warn`/`console.error`
- `plugins/local/` properly uses `this.logger` throughout
- The SDK provides a logger via `PluginStreamDeps`, but only `local` uses it.

### INCONSISTENCY-8: Spotify plugin ignores constructor deps
- **File:** `plugins/spotify/src/index.ts:16-17`
- Every other plugin accepts `deps: PluginStreamDeps` and uses the logger. Spotify has no constructor and silently ignores the deps argument the plugin loader passes.

### INCONSISTENCY-9: Missing `StreamResolver` in `implements` clauses
- `plugins/bandcamp/src/index.ts:5`: `class BandcampPlugin implements ImportProvider` -- has `resolve()` method but doesn't declare `StreamResolver` in `implements`.
- `plugins/soundcloud/src/index.ts:5`: Same issue.

### INCONSISTENCY-10: Typo in filename
- `client/src/components/atoms/music-player/playback-controlts.tsx`
- `controlts` should be `controls`.

### INCONSISTENCY-11: Route response shapes inconsistent across API
- `device.route.ts`: Returns `{ success: true/false, data/message }` wrapper
- `album.route.ts`: Returns `{ taskId }` or `{ error }`
- `track.route.ts`: Returns `{ tracks }`, `{ taskId }`, `{ error }`, `{ message }`, or `{ peaks }`
- `task.route.ts`: Returns `{ tasks }` or `{ ok: true }`
- `plugin.route.ts`: Returns raw array
- No consistent API response envelope.

### INCONSISTENCY-12: Request validation: Zod vs raw parsing
- `album.route.ts`, `track.route.ts`, `artist.route.ts`, `playlist.route.ts`, `search.route.ts`, `share.route.ts`: Use `zValidator` with Zod schemas.
- `device.route.ts`: Uses raw `c.req.param()` and `c.req.json()` with no validation.

### INCONSISTENCY-13: `DatabaseService.getAllBy` vs `DatabaseRepository.getAllBy` filter parameter
- `server/src/types/database-service.type.ts:5`: `filter: string` (required)
- `server/src/types/database-repository.type.ts:7`: `filter?: string` (optional)
- The factory delegates directly to the repository, so it works at runtime, but the types disagree.

---

## 5. Code Smells

### SMELL-1: `MusicPlayerProvider` is ~690 lines
- **File:** `client/src/contexts/music-player-context.tsx`
- Contains audio element management, media session API, native platform handling, Sonos device polling, play count tracking, queue management, and volume control all in one component. Should be split into focused hooks.

### SMELL-2: `stream.service.ts` is ~387 lines with lots of repetition
- **File:** `server/src/services/stream.service.ts`
- Contains 4 different serving strategies (`serveFile`, `serveFileSegment`, `serveCached`, `proxyUrl`) that share the same transcoding and range-request logic but all implement it independently.

### SMELL-3: `AddMusicDialog` is ~350 lines
- **File:** `client/src/components/atoms/add-music-dialog.tsx`
- Manages 8 `useState` calls for search state, debouncing, result rendering, provider filtering, and add-to-library logic.

### SMELL-4: Unsafe `as` casts for collection inserts
- Multiple hooks use `as AlbumLike`, `as ArtistLike`, `as TrackLike`, `as TrackDislike`, `as ShareLink`, `as TrackPlay`, `as Provider` to bypass type checking for incomplete objects.
- Files: `use-album-likes.ts:25`, `use-artist-likes.ts:24`, `use-track-likes.ts:27`, `use-track-dislikes.ts:26`, `share-track-dialog.tsx:38`, `music-player-context.tsx:220`, `create-provider-button.tsx:42`

### SMELL-5: `any` types in server code
- `server/src/services/device-source.service.ts:181`: `getCurrentTrack` returns `Promise<any>` (suppressed with biome-ignore)
- `server/src/services/search.service.ts:118`: `searchLibrary` returns `{ tracks: any[]; albums: any[]; artists: any[] }`

### SMELL-6: Module-level mutable cache for plugin manifests
- **File:** `client/src/hooks/use-plugins.ts:5-6`
- Uses module-level `cachedManifests` / `cachedManifestsPromise` variables. Survives across component lifecycles but has no invalidation mechanism if plugin config changes.

### SMELL-7: `PluginStreamDeps` wraps a single field
- **File:** `plugins/sdk/src/plugin.types.ts`
- `PluginStreamDeps` has only `{ logger: ILogger }`. Every plugin constructor accepts this wrapper for a single field.

### SMELL-8: `metadata` field is a loosely-typed bag
- Throughout the codebase, `track.metadata?.localPath`, `track.metadata?.startTime`, `track.metadata?.endTime` are accessed with `as string | undefined` and `as number | undefined` casts. The `metadata` field has no typed schema, making every access unsafe.

### SMELL-9: Silent error swallowing in `databaseRepositoryFactory`
- **File:** `server/src/factories/database-repository.factory.ts:14,18,22`
- `getOne`, `getOneBy`, `getAllBy` all catch **all** errors and return `null` or `[]`. A network failure or malformed query is indistinguishable from "not found" / "no results". PocketBase could be down and the app would silently act as if collections are empty.

### SMELL-10: In-memory tasks with no automatic cleanup
- **File:** `server/src/services/task.service.ts`
- Tasks accumulate in memory indefinitely. `cleanup()` exists but is never scheduled. `clearCompleted` is only called via explicit API endpoint. On a long-running server, tasks grow unbounded.

### SMELL-11: `device.route.ts` is 292 lines of repetitive try/catch boilerplate
- **File:** `server/src/routes/device.route.ts`
- Each of 10+ endpoints follows the exact same try/catch pattern with `success: true/false` wrapping. Could be a middleware or wrapper function.

### SMELL-12: Fire-and-forget async IIFEs
- `server/src/index.ts:12-27`: Startup IIFE with no `.catch()` on the IIFE itself.
- `server/src/services/album.service.ts:43-88,114-153`: Async IIFEs with internal try/catch but no `.catch()` on the IIFE promise. If the IIFE rejects before entering the try block, it's an unhandled rejection.

### SMELL-13: `console.error` mixed with `logger.error` in server code
- `server/src/plugins/loader.ts:89`, `server/src/services/stream.service.ts:76,78,195,198,255,258,331`: Use `console.error` while the rest of the codebase uses the structured `logger`.

---

## 6. Configuration Issues

### CONFIG-1: `hono` is an unused dependency in every plugin package.json
- `plugins/sdk/package.json`, `plugins/spotify/package.json`, `plugins/youtube/package.json`, `plugins/soundcloud/package.json`, `plugins/bandcamp/package.json`
- No plugin source file imports from `hono`.

### CONFIG-2: Server has 4 unused dependencies
- `server/package.json`:
  - `bandcamp-fetch` - never imported in server code (used by bandcamp plugin)
  - `lru-cache` - never imported in server code (used by SDK)
  - `music-metadata` - never imported in server code (used by local plugin)
  - `sonos` - never imported in server code (the sonos plugin uses `@svrooij/sonos`, which is a different package)

### CONFIG-3: `@svrooij/sonos` version mismatch
- Root `package.json:40`: `"@svrooij/sonos": "^2.5.0"` (stable)
- `plugins/sonos/package.json:12`: `"@svrooij/sonos": "^2.6.0-beta.9"` (beta)
- The root shouldn't have this dependency at all (only `plugins/sonos` uses it).

### CONFIG-4: Stale ESLint references in `turbo.json`
- `turbo.json:46-47,52`: The `lint` task references `eslint.config.js`, `.eslintrc*`, and `.eslintcache`.
- The project uses Biome, not ESLint.

### CONFIG-5: `biome.json` has `vcs.enabled: false` despite configuring git integration
- `biome.json`: `"enabled": false` under `vcs`, with `"clientKind": "git"` and `"useIgnoreFile": true` configured. With `enabled: false`, the git ignore file integration is inactive.

### CONFIG-6: `pocketbase` npm dependency in `db/package.json` appears unnecessary
- `db/package.json:9`: Lists `"pocketbase": "0.26.5"` (the JS SDK client). But the scripts reference the `pocketbase` CLI binary (a Go binary). No `.ts` or `.js` source files in `db/` import the SDK.

### CONFIG-7: SDK re-exports types from shared unnecessarily
- `plugins/sdk/src/manifest.types.ts`: Pass-through re-export of `ConfigSchemaItem` and `PluginManifest` from `@melody-manager/shared`. All plugin consumers already depend on shared.

---

## 7. Type Safety Issues

### TYPE-1: `YtDlpTrackInfo` relies on index signature for actually-used fields
- **File:** `plugins/sdk/src/yt-dlp.util.ts:32-51`
- `YtDlpTrackInfo` has `[key: string]: unknown`. YouTube plugin accesses `info.channel_url`, `info.uploader_url`, `info.playlist_count` which resolve to `unknown` through the index signature instead of having proper typed declarations.

### TYPE-2: `unknown` type for Sonos track data with unsafe property access
- `client/src/clients/device.client.ts:37`: `track: unknown`
- `client/src/contexts/music-player-context.tsx:627-633`: Accessed via runtime type narrowing on an untyped blob.

### TYPE-3: Unsafe cast in `useLikedTracks`
- `client/src/hooks/use-track-likes.ts:50`: `return { data: data as Track[] };`

### TYPE-4: Unsafe cast in `add-music-dialog.tsx`
- `client/src/components/atoms/add-music-dialog.tsx:71`: `(response as { results: SearchResult[] }).results`

### TYPE-5: Unsafe cast in `track-provider-filter.tsx`
- `client/src/components/providers/track-provider-filter.tsx:18`: `const trackProviders = data as TrackProvider[];`
