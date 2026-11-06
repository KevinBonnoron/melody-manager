import type { PocketBaseRecord } from './pocketbase.type';

export type RatingValue = 'like' | 'dislike';

interface Rating extends PocketBaseRecord {
  user: string;
  value: RatingValue;
}

export interface TrackRating extends Rating {
  track: string;
}

export interface AlbumRating extends Rating {
  album: string;
}

export interface ArtistRating extends Rating {
  artist: string;
}

export interface PlaylistRating extends Rating {
  playlist: string;
}
