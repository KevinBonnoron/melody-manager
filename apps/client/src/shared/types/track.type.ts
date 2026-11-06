import type { Album } from './album.type';
import type { Artist } from './artist.type';
import type { Genre } from './genre.type';
import type { PocketBaseRecord } from './pocketbase.type';

export interface Chapter {
  title: string;
  startTime: number;
  endTime: number;
}

export interface TrackMetadata {
  year?: number;
  bitrate?: number;
  format?: string;
  chapters?: Chapter[];
  startTime?: number;
  endTime?: number;
  isrc?: string;
  label?: string;
  releaseDate?: string;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  coverArtUrl?: string;
  musicbrainzId?: string;
  spotifyId?: string;
  youtubeId?: string;
}

export type TrackAvailability = 'file' | 'stream' | 'none';

export interface Track extends PocketBaseRecord {
  id: string;
  title: string;
  duration: number;
  origin: string;
  metadata?: TrackMetadata;
  artists: Artist['id'][];
  album: Album['id'];
  source: string;
  availability: TrackAvailability;
  genres: Genre['id'][];
  created: string;
  updated: string;
}
