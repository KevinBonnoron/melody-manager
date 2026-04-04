import { logger } from '../../lib/logger';
import type { StreamingClient } from '../types';

class YoutubeClient implements StreamingClient {
  /** Fetch the YouTube channel avatar via oEmbed (public, no auth needed). */
  public async getArtistImage(videoUrl: string): Promise<string | null> {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
      if (!oembedRes.ok) {
        return null;
      }

      const oembed = (await oembedRes.json()) as { author_url?: string };
      if (!oembed.author_url) {
        return null;
      }

      const pageRes = await fetch(oembed.author_url);
      if (!pageRes.ok) {
        return null;
      }

      const html = await pageRes.text();
      const match = html.match(/<meta property="og:image" content="([^"]+)"/);
      return match?.[1] ?? null;
    } catch (error) {
      logger.warn(`[youtube] Failed to fetch channel avatar for "${videoUrl}": ${error}`);
      return null;
    }
  }
}

export const youtubeClient = new YoutubeClient();
