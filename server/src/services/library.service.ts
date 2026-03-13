import type { Track } from '@melody-manager/shared';
import { pb } from '../lib/pocketbase';
import { logger } from '../lib/logger';

export const libraryService = {
  /**
   * Auto-like all unique albums, artists, and tracks for a user after an import.
   */
  async autoLikeFromTracks(userId: string, tracks: Track[]): Promise<void> {
    const albumIds = [...new Set(tracks.map((t) => t.album).filter(Boolean))];
    const artistIds = [...new Set(tracks.flatMap((t) => t.artists).filter(Boolean))];
    const trackIds = tracks.map((t) => t.id);

    await Promise.all([...albumIds.map((albumId) => this.likeAlbum(userId, albumId)), ...artistIds.map((artistId) => this.likeArtist(userId, artistId)), ...trackIds.map((trackId) => this.likeTrack(userId, trackId))]);
  },

  async likeAlbum(userId: string, albumId: string): Promise<void> {
    try {
      const existing = await pb
        .collection('album_likes')
        .getFirstListItem(`user = "${userId}" && album = "${albumId}"`)
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
        .getFirstListItem(`user = "${userId}" && artist = "${artistId}"`)
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
        .getFirstListItem(`user = "${userId}" && track = "${trackId}"`)
        .catch(() => null);
      if (!existing) {
        await pb.collection('track_likes').create({ user: userId, track: trackId });
      }
    } catch (error) {
      logger.error(`Failed to auto-like track ${trackId}: ${error}`);
    }
  },
};
