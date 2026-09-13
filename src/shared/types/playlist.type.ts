import type { PocketBaseRecord } from './pocketbase.type';

export type PlaylistType = 'manual' | 'smart';

export type SmartPlaylistStrategy = 'top-tracks' | 'top-genre' | 'top-artist' | 'liked' | 'discovery';

export interface PlaylistMetadata {
  strategy?: SmartPlaylistStrategy;
  genreId?: string;
  artistId?: string;
  limit?: number;
}

export interface Playlist extends PocketBaseRecord {
  name: string;
  type: PlaylistType;
  description?: string;
  cover?: string;
  origin?: string;
  metadata?: PlaylistMetadata;
  tracks: string[];
}
