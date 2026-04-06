import type { PocketBaseRecord } from './pocketbase.type';

export interface ArtistMetadata {
  mbid?: string;
}

export interface Artist extends PocketBaseRecord {
  name: string;
  bio?: string;
  cover?: string;
  sourceUrl?: string;
  metadata?: ArtistMetadata;
}
