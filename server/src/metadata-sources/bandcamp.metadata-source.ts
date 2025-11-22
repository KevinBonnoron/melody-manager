import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class BandcampMetadataSource implements MetadataSource {
  readonly name = 'Bandcamp';
  readonly priority = 90;

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    if (!query.sourceUrl || !query.sourceUrl.startsWith('bandcamp://')) {
      return null;
    }

    return {
      title: query.title,
      artists: query.artist ? [query.artist] : undefined,
      album: query.album,
      confidence: 0.95,
    };
  }
}

export const bandcampMetadataSource = new BandcampMetadataSource();
