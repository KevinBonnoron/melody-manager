import type { Expand } from './pocketbase.type';
import type { Playlist } from './playlist.type';
import type { User } from './user.type';

export interface PlaylistLike extends Expand<{ user: User; playlist: Playlist }> {
  user: string;
  playlist: string;
}
