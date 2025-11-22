import { logger } from '../lib/logger';
import type { EnrichedMetadata, MetadataSearchQuery, MetadataSource } from '../types';

class MetadataSourceService {
  async getMetadataWithSources(query: MetadataSearchQuery, sources: MetadataSource[]): Promise<EnrichedMetadata | null> {
    const sortedSources = [...sources].sort((a, b) => b.priority - a.priority);
    const results: Array<{ source: MetadataSource; metadata: EnrichedMetadata }> = [];

    for (const source of sortedSources) {
      try {
        const result = await source.getMetadata(query);

        if (result) {
          results.push({ source, metadata: result });
        }
      } catch (error) {
        logger.error(`Error fetching metadata from ${source.name}: ${error}`);
      }
    }

    if (results.length === 0) {
      return null;
    }

    return this.mergeMetadata(results);
  }

  private mergeMetadata(results: Array<{ source: MetadataSource; metadata: EnrichedMetadata }>): EnrichedMetadata {
    const merged: EnrichedMetadata = {};

    for (const { metadata } of results) {
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined && value !== null) {
          if (merged[key as keyof EnrichedMetadata] === undefined) {
            (merged as Record<string, unknown>)[key] = value;
          }
        }
      }
    }

    const highestConfidence = Math.max(...results.map((r) => r.metadata.confidence ?? 0.5));
    merged.confidence = highestConfidence;

    return merged;
  }
}

export const metadataSourceService = new MetadataSourceService();
