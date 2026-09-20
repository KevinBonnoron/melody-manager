import type { PocketBaseRecord } from './pocketbase.type';
import type { Track } from './track.type';

export type RepeatMode = 'none' | 'all' | 'one';

/** The record as it lives in the database, which is what realtime hands over. */
export interface PlaybackState extends PocketBaseRecord {
  id: string;
  user: string;
  track: Track['id'];
  position: number;
  positionAt: string;
  playing: boolean;
  devices: string[];
  list: Track['id'][];
  order: number[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  created: string;
  updated: string;
}

/** The same record as an order answers with it, carrying the server's clock. */
export interface PlayerState {
  track: Track['id'];
  position: number;
  positionAt: string;
  playing: boolean;
  devices: string[];
  list: Track['id'][];
  order: number[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  now: string;
}
