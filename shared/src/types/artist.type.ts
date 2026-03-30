import type { Expand } from './pocketbase.type';

export interface ArtistMetadata {
  mbid?: string;
}

export interface Artist extends Expand<Record<string, never>> {
  name: string;
  bio?: string;
  image?: string;
  imageUrl?: string;
  externalUrl?: string;
  metadata?: ArtistMetadata;
}
