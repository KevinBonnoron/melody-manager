import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { albumCollection } from '@/collections/album.collection';

export function useAlbums() {
  return useLiveQuery((q) => q.from({ albums: albumCollection }));
}

export function useAlbum(albumId: string) {
  return useLiveQuery(
    (q) =>
      q
        .from({ albums: albumCollection })
        .where(({ albums }) => eq(albums.id, albumId))
        .findOne(),
    [albumId],
  );
}

export function useAlbumsByIds(ids: string[]) {
  return useLiveQuery((q) => q.from({ albums: albumCollection }).where(({ albums }) => inArray(albums.id, ids)), [ids.join(',')]);
}

export function useAlbumsForArtist(artistId: string) {
  return useLiveQuery(
    (q) => q.from({ albums: albumCollection }).where(({ albums }) => inArray(artistId, albums.artists)),
    [artistId],
  );
}
