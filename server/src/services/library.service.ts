import type { Track } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pb, pbFilter } from '../lib/pocketbase';

export const libraryService = {
  /**
   * Auto-like all unique albums, artists, and tracks for a user after an import.
   */
  async autoLikeFromTracks(userId: string, tracks: Track[]): Promise<void> {
    const albumIds = [...new Set(tracks.map((t) => t.album).filter(Boolean))];

    const BATCH_SIZE = 25;
    for (let i = 0; i < albumIds.length; i += BATCH_SIZE) {
      await Promise.all(albumIds.slice(i, i + BATCH_SIZE).map((albumId) => this.likeAlbum(userId, albumId)));
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
};
