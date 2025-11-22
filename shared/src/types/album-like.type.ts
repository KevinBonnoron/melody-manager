import type { Album } from './album.type';
import type { Expand } from './pocketbase.type';
import type { User } from './user.type';

export interface AlbumLike extends Expand<{ user: User; album: Album }> {
  user: string;
  album: string;
}
