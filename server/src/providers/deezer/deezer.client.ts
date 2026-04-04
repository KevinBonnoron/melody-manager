import { logger } from '../../lib/logger';
import type { StreamingClient } from '../types';

interface DeezerArtistResult {
  name: string;
  picture_xl?: string;
}

class DeezerClient implements StreamingClient {
  public async getArtistImage(artistName: string): Promise<string | null> {
    try {
      const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`);
      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as { data?: DeezerArtistResult[] };
      const match = data.data?.[0];
      if (match?.picture_xl && match.name.toLowerCase() === artistName.toLowerCase()) {
        return match.picture_xl;
      }

      return null;
    } catch (error) {
      logger.warn(`[deezer] Failed to fetch artist image for "${artistName}": ${error}`);
      return null;
    }
  }
}

export const deezerClient = new DeezerClient();
