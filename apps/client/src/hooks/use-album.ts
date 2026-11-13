import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { albumCollection } from '@/collections/album.collection';
import type { Album } from '@/shared';
import { useLibraryIndex } from './use-library-index';

export function useAlbums(): { data: Album[]; isLoading: boolean } {
  const { playableAlbums, loading } = useLibraryIndex();
  return { data: playableAlbums, isLoading: loading.tracks || loading.albums };
}

export function useAlbum(albumId: string) {
  return useLiveQuery({
    query: (q) =>
      q
        .from({ albums: albumCollection })
        .where(({ albums }) => eq(albums.id, albumId))
        .findOne(),
  });
}

export function useAlbumsByIds(ids: string[]) {
  return useLiveQuery({ query: (q) => q.from({ albums: albumCollection }).where(({ albums }) => inArray(albums.id, ids)) });
}

export function useAlbumsForArtist(artistId: string) {
  return useLiveQuery({ query: (q) => q.from({ albums: albumCollection }).where(({ albums }) => inArray(artistId, albums.artists)) });
}
