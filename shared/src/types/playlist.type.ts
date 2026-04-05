import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';

export interface Playlist extends Expand<{ tracks: Track[] }> {
  name: string;
  description?: string;
  cover?: string;
  coverUrl?: string;
  sourceUrl?: string;
  tracks: string[];
}
