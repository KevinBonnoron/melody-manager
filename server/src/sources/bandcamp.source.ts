import type { BandcampTrackProvider, Track, TrackSearchResult } from '@melody-manager/shared';
import { BandcampFetch } from 'bandcamp-fetch';
import type { TrackSource } from '../types';
import { parseCookies } from '../utils';
import { logger } from '../lib/logger';

class BandcampSource implements TrackSource<BandcampTrackProvider> {
  async searchTracks(query: string, provider: BandcampTrackProvider): Promise<TrackSearchResult[]> {
    logger.warn('[Bandcamp] Search not yet implemented');
    return [];
  }

  async getTracks(url: string, provider: BandcampTrackProvider): Promise<Track[]> {
    return [];
  }

  /**
   * Get stream URL for a Bandcamp track
   * This should be called when playing a track with bandcamp:// sourceUrl
   */
  async getStreamUrl(albumUrl: string, trackName: string, cookies: string): Promise<string | null> {
    // Parse Netscape cookies to HTTP Cookie header format
    const cookieHeader = parseCookies(cookies);
    const bcfetch = new BandcampFetch({ cookie: cookieHeader });

    try {
      // Decode the URL
      const decodedAlbumUrl = decodeURIComponent(albumUrl);
      const decodedTrackName = decodeURIComponent(trackName);

      // Fetch the album info to get stream URLs
      const itemInfo = await bcfetch.album.getInfo({ albumUrl: decodedAlbumUrl });

      if (!itemInfo) {
        logger.error('[Bandcamp] No album info found');
        return null;
      }

      // If there are tracks, find the matching one
      if (itemInfo.tracks && itemInfo.tracks.length > 0) {
        const track = itemInfo.tracks.find((t: { name: string }) => t.name === decodedTrackName);

        if (track?.streamUrl) {
          return track.streamUrl;
        }
      }

      // If no tracks array or track not found, try to get stream URL from album directly
      // This might be the case for single-track items
      // biome-ignore lint/suspicious/noExplicitAny: bandcamp-fetch types may not include all properties
      if ((itemInfo as any).streamUrl) {
        // biome-ignore lint/suspicious/noExplicitAny: bandcamp-fetch types may not include all properties
        return (itemInfo as any).streamUrl;
      }

      logger.error(`[Bandcamp] No stream URL found for track: ${decodedTrackName}`);
      return null;
    } catch (error) {
      logger.error(`[Bandcamp] Error getting stream URL: ${error}`);
      return null;
    }
  }
}

export const bandcampSource = new BandcampSource();
