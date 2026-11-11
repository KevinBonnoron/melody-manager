import type { Artist } from './artist.type';
import type { PocketBaseRecord } from './pocketbase.type';

export const ALBUM_TYPES = ['single', 'ep', 'album', 'mix'] as const;

export type AlbumType = (typeof ALBUM_TYPES)[number];

export interface Album extends PocketBaseRecord {
  name: string;
  cover?: string;
  year?: number;
  /** Kind of release; empty when nothing is known about the whole of the album. */
  type?: AlbumType | '';
  /** True once a person chose the type, so it is no longer worked out from the tracks. */
  typeLocked?: boolean;
  artists: Artist['id'][];
}
