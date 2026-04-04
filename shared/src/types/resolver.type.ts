import type { TrackProvider } from './provider.type';
import type { TrackMetadata } from './track.type';

export interface ResolvedTrack {
  title: string;
  duration: number;
  sourceUrl: string;
  artistName: string;
  albumName: string;
  coverUrl?: string;
  metadata?: TrackMetadata;
  genreNames?: string[];
}

export interface ResolvedAlbum {
  name: string;
  artistName: string;
  coverUrl?: string;
  tracks: ResolvedTrack[];
}

export interface ResolvedArtist {
  name: string;
  tracks: ResolvedTrack[];
}

export interface ResolvedPlaylist {
  name: string;
  tracks: ResolvedTrack[];
}

export interface TrackResolver {
  resolveTracks(url: string, provider: TrackProvider): Promise<ResolvedTrack[]>;
}

export interface AlbumResolver {
  resolveAlbum(url: string, provider: TrackProvider): Promise<ResolvedAlbum>;
}

export interface ArtistResolver {
  resolveArtist(url: string, provider: TrackProvider): Promise<ResolvedArtist>;
}

export interface PlaylistResolver {
  resolvePlaylist(url: string, provider: TrackProvider): Promise<ResolvedPlaylist>;
}
