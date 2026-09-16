import type { PocketBaseRecord } from './pocketbase.type';
import type { Track } from './track.type';

export interface PlaybackState extends PocketBaseRecord {
  id: string;
  user: string;
  track: Track['id'];
  position: number;
  queue: Track['id'][];
  created: string;
  updated: string;
}
