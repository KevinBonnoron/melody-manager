import type { Artist } from './artist.type';
import type { PocketBaseRecord } from './pocketbase.type';

export interface Album extends PocketBaseRecord {
  name: string;
  cover?: string;
  year?: number;
  artists: Artist['id'][];
}
