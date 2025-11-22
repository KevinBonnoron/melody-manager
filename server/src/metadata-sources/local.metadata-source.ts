import { logger } from '../lib/logger';
import { metadataService } from '../services';
import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class LocalMetadataSource implements MetadataSource {
  readonly name = 'Local';
  readonly priority = 100;

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    if (!query.title || !('filePath' in query)) {
      return null;
    }

    try {
      const filePath = (query as MetadataSearchQuery & { filePath: string }).filePath;
      const metadata = await metadataService.extractMetadata(filePath);

      if (!metadata) {
        return null;
      }

      return {
        title: metadata.title,
        artists: metadata.artists,
        album: metadata.album,
        year: metadata.year,
        genres: metadata.genres,
        coverArtUrl: metadata.coverImage ? `data:${metadata.coverImage.format};base64,${metadata.coverImage.data.toString('base64')}` : undefined,
        confidence: 1.0,
      };
    } catch (error) {
      logger.error(`Error extracting local metadata: ${error}`);
      return null;
    }
  }
}

export const localMetadataSource = new LocalMetadataSource();
