import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';
import type { User } from './user.type';

export interface TrackLike extends Expand<{ user: User; track: Track }> {
  user: string;
  track: string;
}
