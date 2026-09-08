import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';
import type { User } from './user.type';

export interface ShareLink extends Expand<{ track: Track; createdBy: User }> {
  token: string;
  track: string;
  createdBy: string;
  expiresAt: string;
}
