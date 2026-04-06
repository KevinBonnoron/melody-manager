import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlaylistMetadata, SmartPlaylistStrategy } from '@melody-manager/shared';
import { databaseServiceFactory } from '../factories';
import { logger } from '../lib/logger';
import { pb, pbFilter } from '../lib/pocketbase';
import { playlistLikeRepository, playlistRepository, trackDislikeRepository, trackLikeRepository, trackPlayRepository, trackRepository } from '../repositories';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_LIMIT = 50;
const MIN_PLAYS_FOR_AUTO_CREATE = 10;
const MIN_LIKES_FOR_AUTO_CREATE = 5;

const ASSETS_DIR = join(import.meta.dir, '../assets/smart-playlists');

interface DefaultSmartPlaylist {
  nameKey: string;
  strategy: SmartPlaylistStrategy;
  coverFile: string;
  canCreate: (playCount: number, likeCount: number) => boolean;
}

const DEFAULT_SMART_PLAYLISTS: DefaultSmartPlaylist[] = [
  { nameKey: 'most-played', strategy: 'top-tracks', coverFile: 'most-played.svg', canCreate: (plays) => plays >= MIN_PLAYS_FOR_AUTO_CREATE },
  { nameKey: 'liked-tracks', strategy: 'liked', coverFile: 'liked-tracks.svg', canCreate: (_, likes) => likes >= MIN_LIKES_FOR_AUTO_CREATE },
  { nameKey: 'discovery', strategy: 'discovery', coverFile: 'discovery.svg', canCreate: (plays) => plays >= MIN_PLAYS_FOR_AUTO_CREATE },
];

const baseService = databaseServiceFactory(playlistRepository);

async function getTrackCountsForUser(userId: string): Promise<Map<string, number>> {
  const records = await trackPlayRepository.getCompletedTrackCountsByUser(userId);
  const counts = new Map<string, number>();

  for (const r of records) {
    counts.set(r.track, (counts.get(r.track) ?? 0) + 1);
  }

  return counts;
}

async function generateTopTracks(userId: string, limit: number): Promise<string[]> {
  const trackCounts = await getTrackCountsForUser(userId);

  return [...trackCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([trackId]) => trackId);
}

async function generateTopGenre(userId: string, genreId: string, limit: number): Promise<string[]> {
  const trackCounts = await getTrackCountsForUser(userId);
  const playedTrackIds = [...trackCounts.keys()];

  if (playedTrackIds.length === 0) {
    return [];
  }

  const tracks = await trackRepository.getAllBy(pbFilter('id IN {:ids}', { ids: playedTrackIds }));
  const genreTracks = tracks.filter((t) => t.genres.includes(genreId));

  return genreTracks
    .sort((a, b) => (trackCounts.get(b.id) ?? 0) - (trackCounts.get(a.id) ?? 0))
    .slice(0, limit)
    .map((t) => t.id);
}

async function generateTopArtist(userId: string, artistId: string, limit: number): Promise<string[]> {
  const trackCounts = await getTrackCountsForUser(userId);
  const playedTrackIds = [...trackCounts.keys()];

  if (playedTrackIds.length === 0) {
    return [];
  }

  const tracks = await trackRepository.getAllBy(pbFilter('id IN {:ids}', { ids: playedTrackIds }));
  const artistTracks = tracks.filter((t) => t.artists.includes(artistId));

  return artistTracks
    .sort((a, b) => (trackCounts.get(b.id) ?? 0) - (trackCounts.get(a.id) ?? 0))
    .slice(0, limit)
    .map((t) => t.id);
}

async function generateLiked(userId: string, limit: number): Promise<string[]> {
  const [likedTrackIds, dislikedTrackIds] = await Promise.all([trackLikeRepository.getLikedTrackIdsByUser(userId), trackDislikeRepository.getDislikedTrackIdsByUser(userId)]);
  const dislikedSet = new Set(dislikedTrackIds);

  return likedTrackIds.filter((id) => !dislikedSet.has(id)).slice(0, limit);
}

async function generateDiscovery(userId: string, limit: number): Promise<string[]> {
  const trackCounts = await getTrackCountsForUser(userId);
  const playedTrackIds = new Set(trackCounts.keys());

  if (playedTrackIds.size === 0) {
    return [];
  }

  const playedTracks = await trackRepository.getAllBy(pbFilter('id IN {:ids}', { ids: [...playedTrackIds] }));

  // Collect frequent genres and artists
  const genreCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();

  for (const track of playedTracks) {
    const count = trackCounts.get(track.id) ?? 0;

    for (const genreId of track.genres) {
      genreCounts.set(genreId, (genreCounts.get(genreId) ?? 0) + count);
    }

    for (const artistId of track.artists) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + count);
    }
  }

  const topGenreIds = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const topArtistIds = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  // Find unplayed tracks matching top genres/artists via DB filter
  const genreFilters = topGenreIds.map((_, i) => `genres.id ?= {:g${i}}`).join(' || ');
  const artistFilters = topArtistIds.map((_, i) => `artists.id ?= {:a${i}}`).join(' || ');
  const filterParts = [genreFilters, artistFilters].filter(Boolean).join(' || ');
  const filterParams = {
    ...Object.fromEntries(topGenreIds.map((id, i) => [`g${i}`, id])),
    ...Object.fromEntries(topArtistIds.map((id, i) => [`a${i}`, id])),
  };

  const candidateTracks = filterParts ? await trackRepository.getAllBy(pbFilter(filterParts, filterParams)) : [];
  const matched = candidateTracks.filter((t) => !playedTrackIds.has(t.id));

  // Fill with random unplayed tracks if not enough matches
  let pool = matched;
  if (matched.length < limit) {
    const matchedIds = new Set(matched.map((t) => t.id));
    const allTracks = await trackRepository.getAllBy();
    const extra = allTracks.filter((t) => !playedTrackIds.has(t.id) && !matchedIds.has(t.id));
    pool = [...matched, ...extra];
  }

  // Shuffle and pick
  return pool
    .map((t) => ({ t, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, limit)
    .map(({ t }) => t.id);
}

const strategies: Record<SmartPlaylistStrategy, (userId: string, metadata: PlaylistMetadata) => Promise<string[]>> = {
  'top-tracks': (userId, meta) => generateTopTracks(userId, meta.limit ?? DEFAULT_LIMIT),
  'top-genre': (userId, meta) => generateTopGenre(userId, meta.genreId ?? '', meta.limit ?? DEFAULT_LIMIT),
  'top-artist': (userId, meta) => generateTopArtist(userId, meta.artistId ?? '', meta.limit ?? DEFAULT_LIMIT),
  liked: (userId, meta) => generateLiked(userId, meta.limit ?? DEFAULT_LIMIT),
  discovery: (userId, meta) => generateDiscovery(userId, meta.limit ?? DEFAULT_LIMIT),
};

async function refreshSmartPlaylist(playlistId: string, userId: string): Promise<void> {
  const playlist = await playlistRepository.getOne(playlistId);
  if (!playlist || playlist.type !== 'smart' || !playlist.metadata?.strategy) {
    return;
  }

  const strategy = strategies[playlist.metadata.strategy];
  if (!strategy) {
    return;
  }

  const trackIds = await strategy(userId, playlist.metadata);
  await playlistRepository.update(playlistId, { tracks: trackIds });
}

async function autoCreateSmartPlaylists(userId: string, existingStrategies: Set<string>): Promise<void> {
  const [playRecords, likedTrackIds] = await Promise.all([trackPlayRepository.getCompletedTrackCountsByUser(userId), trackLikeRepository.getLikedTrackIdsByUser(userId)]);
  const playCount = playRecords.length;
  const likeCount = likedTrackIds.length;

  for (const def of DEFAULT_SMART_PLAYLISTS) {
    if (existingStrategies.has(def.strategy)) {
      continue;
    }

    if (!def.canCreate(playCount, likeCount)) {
      continue;
    }

    try {
      const playlist = await playlistRepository.create({ name: def.nameKey, type: 'smart', metadata: { strategy: def.strategy, limit: DEFAULT_LIMIT }, tracks: [] });
      await playlistLikeRepository.create({ user: userId, playlist: playlist.id });

      try {
        const coverPath = join(ASSETS_DIR, def.coverFile);
        const coverBuffer = readFileSync(coverPath);
        const formData = new FormData();
        formData.append('cover', new Blob([coverBuffer], { type: 'image/svg+xml' }), def.coverFile);
        await pb.collection('playlists').update(playlist.id, formData);
      } catch (coverError) {
        logger.warn(`[playlist] Failed to upload cover for "${def.nameKey}": ${coverError}`);
      }

      await refreshSmartPlaylist(playlist.id, userId);
      logger.info(`[playlist] Auto-created smart playlist "${def.nameKey}" for user ${userId}`);
    } catch (error) {
      logger.error(`[playlist] Failed to auto-create smart playlist "${def.nameKey}": ${error}`);
    }
  }
}

interface RefreshResult {
  refreshed: number;
  failed: number;
}

async function refreshSmartPlaylistsForUser(userId: string): Promise<RefreshResult> {
  const likes = await playlistLikeRepository.getAllBy(pbFilter('user = {:userId}', { userId }));
  const playlistIds = likes.map((l) => l.playlist);

  const playlists = playlistIds.length > 0 ? await playlistRepository.getAllBy(pbFilter(playlistIds.map((_, i) => `id = {:id${i}}`).join(' || '), Object.fromEntries(playlistIds.map((id, i) => [`id${i}`, id])))) : [];
  const smartPlaylists = playlists.filter((p) => p.type === 'smart' && p.metadata?.strategy);

  // Auto-create missing default smart playlists
  const existingStrategies = new Set(smartPlaylists.map((p) => p.metadata?.strategy).filter(Boolean) as string[]);
  await autoCreateSmartPlaylists(userId, existingStrategies);

  // Refresh stale smart playlists
  const now = Date.now();
  let refreshed = 0;
  let failed = 0;

  for (const playlist of smartPlaylists) {
    const updatedAt = new Date(playlist.updated).getTime();
    if (now - updatedAt < REFRESH_INTERVAL_MS) {
      continue;
    }

    try {
      await refreshSmartPlaylist(playlist.id, userId);
      refreshed++;
    } catch (error) {
      failed++;
      logger.error(`[playlist] Failed to refresh smart playlist "${playlist.name}": ${error}`);
    }
  }

  return { refreshed, failed };
}

export const playlistService = {
  ...baseService,
  refreshSmartPlaylist,
  refreshSmartPlaylistsForUser,
};
