import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { albumCollection } from '@/collections/album.collection';
import { trackCollection } from '@/collections/track.collection';

export function useAlbums() {
  const { data: tracks = [], isLoading: isLoadingTracks } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });
  const albumIds = useMemo(() => [...new Set(tracks.map((t) => t.album))], [tracks]);
  const { data, isLoading } = useLiveQuery({ query: (q) => q.from({ albums: albumCollection }).where(({ albums }) => inArray(albums.id, albumIds.length > 0 ? albumIds : [''])) });
  return { data, isLoading: isLoadingTracks || isLoading };
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
