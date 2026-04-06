import type { Album, Artist, Playlist } from '@melody-manager/shared';
import { pb } from './pocketbase';

export function getAlbumCoverUrl(album: Album): string | undefined {
  return album.cover ? pb.files.getURL(album, album.cover, { thumb: '500x500' }) : undefined;
}

export function getArtistCoverUrl(artist: Artist): string | undefined {
  return artist.cover ? pb.files.getURL(artist, artist.cover, { thumb: '500x500' }) : undefined;
}

export function getPlaylistCoverUrl(playlist: Playlist): string | undefined {
  return playlist.cover ? pb.files.getURL(playlist, playlist.cover, { thumb: '500x500' }) : undefined;
}
