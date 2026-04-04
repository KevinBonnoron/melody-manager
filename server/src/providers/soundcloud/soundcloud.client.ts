import { logger } from '../../lib/logger';
import type { StreamingClient } from '../types';

const ALLOWED_HOSTNAMES = ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'];

class SoundcloudClient implements StreamingClient {
  /** Fetch the SoundCloud artist avatar from the track page's og:image. */
  public async getArtistImage(trackUrl: string): Promise<string | null> {
    try {
      const parsed = new URL(trackUrl);
      if (!ALLOWED_HOSTNAMES.includes(parsed.hostname)) {
        logger.warn(`[soundcloud] Rejected non-SoundCloud URL: "${trackUrl}"`);
        return null;
      }

      const pageRes = await fetch(trackUrl);
      if (!pageRes.ok) {
        return null;
      }

      const html = await pageRes.text();
      const match = html.match(/<meta property="og:image" content="([^"]+)"/);
      return match?.[1] ?? null;
    } catch (error) {
      logger.warn(`[soundcloud] Failed to fetch artist avatar for "${trackUrl}": ${error}`);
      return null;
    }
  }
}

export const soundcloudClient = new SoundcloudClient();
