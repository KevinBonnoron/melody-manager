import type { Artist } from './artist.type';
import type { Expand } from './pocketbase.type';

export interface Album extends Expand<{ artists: Artist[] }> {
  name: string;
  cover?: string;
  year?: number;
  artists: Artist['id'][];
}
