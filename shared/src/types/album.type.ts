import type { Artist } from './artist.type';
import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';

export interface Album extends Expand<{ artists: Artist[]; tracks_via_album: Track[] }> {
  name: string;
  artists: string[];
  coverUrl?: string;
}
