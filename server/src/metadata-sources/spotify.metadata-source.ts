import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class SpotifyMetadataSource implements MetadataSource {
  readonly name = 'Spotify';
  readonly priority = 95;

  async getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null> {
    if (!query.sourceUrl || !query.sourceUrl.includes('spotify.com')) {
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

export const spotifyMetadataSource = new SpotifyMetadataSource();
