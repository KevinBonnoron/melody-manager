import { logger } from '../lib/logger';
import { ytDlpService } from '../services';
import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class SoundCloudMetadataSource implements MetadataSource {
  readonly name = 'SoundCloud';
  readonly priority = 90;

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    if (!query.sourceUrl || !query.sourceUrl.includes('soundcloud.com')) {
      return null;
    }

    try {
      const info = await ytDlpService.extractTrackInfo(query.sourceUrl);

      if (!info) {
        return null;
      }

      const artists: string[] = [];
      if (info.artist) {
        artists.push(info.artist);
      } else if (info.uploader) {
        artists.push(info.uploader);
      }

      const year = info.upload_date ? Number.parseInt(info.upload_date.substring(0, 4), 10) : undefined;

      return {
        title: info.title,
        artists,
        album: info.album,
        year,
        coverArtUrl: info.thumbnail,
        confidence: 0.9,
      };
    } catch (error) {
      logger.error(`Error extracting SoundCloud metadata: ${error}`);
      return null;
    }
  }
}

export const soundcloudMetadataSource = new SoundCloudMetadataSource();
