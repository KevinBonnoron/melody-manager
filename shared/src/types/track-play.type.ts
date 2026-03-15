import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';
import type { User } from './user.type';

export interface TrackPlay extends Expand<{ user: User; track: Track }> {
  user: string;
  track: string;
  completed: boolean;
}
