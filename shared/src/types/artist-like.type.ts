import type { Artist } from './artist.type';
import type { Expand } from './pocketbase.type';
import type { User } from './user.type';

export interface ArtistLike extends Expand<{ user: User; artist: Artist }> {
  user: string;
  artist: string;
}
