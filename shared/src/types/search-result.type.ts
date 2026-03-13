export type SearchType = 'track' | 'album' | 'artist' | 'playlist';

export interface LibraryStatus {
  isInLibrary: boolean;
  tracksInLibrary?: number;
  totalTracks?: number;
}

interface BaseSearchResult {
  type: SearchType;
  provider: string;
  externalUrl: string;
  libraryStatus?: LibraryStatus;
}

export interface TrackSearchResult extends BaseSearchResult {
  type: 'track';
  title: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
}

export interface AlbumSearchResult extends BaseSearchResult {
  type: 'album';
  name: string;
  artist?: string;
  coverUrl?: string;
  trackCount?: number;
  releaseYear?: number;
}

export interface ArtistSearchResult extends BaseSearchResult {
  type: 'artist';
  name: string;
  imageUrl?: string;
  genres?: string[];
  albumCount?: number;
  trackCount?: number;
}

export interface PlaylistSearchResult extends BaseSearchResult {
  type: 'playlist';
  name: string;
  description?: string;
  coverUrl?: string;
  trackCount?: number;
  owner?: string;
}

export type SearchResult = TrackSearchResult | AlbumSearchResult | ArtistSearchResult | PlaylistSearchResult;

// Type guards
export function isTrackResult(result: SearchResult): result is TrackSearchResult {
  return result.type === 'track';
}

export function isAlbumResult(result: SearchResult): result is AlbumSearchResult {
  return result.type === 'album';
}

export function isArtistResult(result: SearchResult): result is ArtistSearchResult {
  return result.type === 'artist';
}

export function isPlaylistResult(result: SearchResult): result is PlaylistSearchResult {
  return result.type === 'playlist';
}
