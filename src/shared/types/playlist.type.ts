import type { Expand } from './pocketbase.type';
import type { Track } from './track.type';

export type PlaylistType = 'manual' | 'smart';

export type SmartPlaylistStrategy = 'top-tracks' | 'top-genre' | 'top-artist' | 'liked' | 'discovery';

export interface PlaylistMetadata {
  strategy?: SmartPlaylistStrategy;
  genreId?: string;
  artistId?: string;
  limit?: number;
}

export interface Playlist extends Expand<{ tracks: Track[] }> {
  name: string;
  type: PlaylistType;
  description?: string;
  cover?: string;
  sourceUrl?: string;
  metadata?: PlaylistMetadata;
  tracks: string[];
}
