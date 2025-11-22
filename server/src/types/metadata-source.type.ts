import type { EnrichedMetadata, MetadataSearchQuery } from '.';

export interface MetadataSource {
  readonly name: string;
  readonly priority: number;

  getMetadata(query: MetadataSearchQuery): Promise<EnrichedMetadata | null>;
}
