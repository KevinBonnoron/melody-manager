import type { PocketBaseRecord } from './pocketbase.type';

// One opinion per user per entity: liking and disliking are the same field,
// which is why a track can no longer be both at once.
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
