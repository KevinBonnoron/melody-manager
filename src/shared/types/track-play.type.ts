import type { PocketBaseRecord } from './pocketbase.type';

export interface TrackPlay extends PocketBaseRecord {
  user: string;
  track: string;
  completed: boolean;
}
