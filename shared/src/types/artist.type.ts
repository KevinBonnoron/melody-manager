import type { Album } from './album.type';
import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';

export interface Artist extends Expand<{ tracks_via_artists: Track[]; albums_via_artists: Album[] }> {
  name: string;
  bio?: string;
  imageUrl?: string;
  externalUrl?: string;
}
