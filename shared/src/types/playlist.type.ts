import type { Track } from './track.type';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}
