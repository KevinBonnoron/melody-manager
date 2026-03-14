import type { Track } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pb, pbFilter } from '../lib/pocketbase';

export const libraryService = {
  /**
   * Auto-like all unique albums, artists, and tracks for a user after an import.
   */
  async autoLikeFromTracks(userId: string, tracks: Track[]): Promise<void> {
    const albumIds = [...new Set(tracks.map((t) => t.album).filter(Boolean))];
    const artistIds = [...new Set(tracks.flatMap((t) => t.artists).filter(Boolean))];
    const trackIds = [...new Set(tracks.map((t) => t.id))];

    const ops = [...albumIds.map((albumId) => () => this.likeAlbum(userId, albumId)), ...artistIds.map((artistId) => () => this.likeArtist(userId, artistId)), ...trackIds.map((trackId) => () => this.likeTrack(userId, trackId))];

    const BATCH_SIZE = 25;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await Promise.all(ops.slice(i, i + BATCH_SIZE).map((run) => run()));
    }
  },

  async likeAlbum(userId: string, albumId: string): Promise<void> {
    try {
      const existing = await pb
        .collection('album_likes')
        .getFirstListItem(pbFilter('user = {:userId} && album = {:albumId}', { userId, albumId }))
        .catch(() => null);
      if (!existing) {
        await pb.collection('album_likes').create({ user: userId, album: albumId });
      }
    } catch (error) {
      logger.error(`Failed to auto-like album ${albumId}: ${error}`);
    }
  },

  async likeArtist(userId: string, artistId: string): Promise<void> {
    try {
      const existing = await pb
        .collection('artist_likes')
        .getFirstListItem(pbFilter('user = {:userId} && artist = {:artistId}', { userId, artistId }))
        .catch(() => null);
      if (!existing) {
        await pb.collection('artist_likes').create({ user: userId, artist: artistId });
      }
    } catch (error) {
      logger.error(`Failed to auto-like artist ${artistId}: ${error}`);
    }
  },

  async likeTrack(userId: string, trackId: string): Promise<void> {
    try {
      const existing = await pb
        .collection('track_likes')
        .getFirstListItem(pbFilter('user = {:userId} && track = {:trackId}', { userId, trackId }))
        .catch(() => null);
      if (!existing) {
        await pb.collection('track_likes').create({ user: userId, track: trackId });
      }
    } catch (error) {
      logger.error(`Failed to auto-like track ${trackId}: ${error}`);
    }
  },
};
