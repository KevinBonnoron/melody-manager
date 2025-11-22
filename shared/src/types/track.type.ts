import type { Album } from './album.type';
import type { Artist } from './artist.type';
import type { Genre } from './genre.type';
import type { Expand } from './pocketbase.type';
import type { TrackProvider } from './track-provider.type';

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

export interface Track extends Expand<{ artists: Artist[]; album: Album; provider: TrackProvider; genres: Genre[] }> {
  id: string;
  title: string;
  duration: number;
  sourceUrl: string;
  metadata?: TrackMetadata;
  artists: string[];
  album: string;
  provider: string;
  genres: string[];
  created: string;
  updated: string;
}
