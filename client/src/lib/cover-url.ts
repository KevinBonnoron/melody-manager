import type { Album, Artist, Playlist } from '@melody-manager/shared';
import { pb } from './pocketbase';

export function getAlbumCoverUrl(album: Album): string | undefined {
  if (album.cover) {
    return pb.files.getURL(album, album.cover, { thumb: '500x500' });
  }

  return album.coverUrl;
}

export function getArtistImageUrl(artist: Artist): string | undefined {
  if (artist.image) {
    return pb.files.getURL(artist, artist.image, { thumb: '500x500' });
  }

  return artist.imageUrl;
}

export function getPlaylistCoverUrl(playlist: Playlist): string | undefined {
  if (playlist.cover) {
    return pb.files.getURL(playlist, playlist.cover, { thumb: '500x500' });
  }

  return playlist.coverUrl;
}
