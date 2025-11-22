import { logger } from '../lib/logger';
import { ytDlpService } from '../services';
import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class YoutubeMetadataSource implements MetadataSource {
  readonly name = 'YouTube';
  readonly priority = 90;

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    if (!('sourceUrl' in query)) {
      return null;
    }

    try {
      const sourceUrl = (query as MetadataSearchQuery & { sourceUrl: string }).sourceUrl;
      const info = await ytDlpService.extractTrackInfo(sourceUrl);

      if (!info) {
        return null;
      }

      const artists: string[] = [];
      if (info.artist) {
        artists.push(info.artist);
      } else if (info.uploader) {
        artists.push(info.uploader);
      } else if (info.channel) {
        artists.push(info.channel);
      }

      const year = info.upload_date ? Number.parseInt(info.upload_date.substring(0, 4), 10) : undefined;

      const youtubeId = this.extractYoutubeId(sourceUrl);

      return {
        title: info.title,
        artists,
        album: info.album,
        year,
        coverArtUrl: info.thumbnail,
        youtubeId,
        confidence: 0.9,
      };
    } catch (error) {
      logger.error(`Error extracting YouTube metadata: ${error}`);
      return null;
    }
  }

  private extractYoutubeId(url: string): string | undefined {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/, /youtube\.com\/embed\/([^&\n?#]+)/];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return undefined;
  }
}

export const youtubeMetadataSource = new YoutubeMetadataSource();
