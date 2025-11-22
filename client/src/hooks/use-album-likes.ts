import { albumLikeCollection } from '@/collections/album-like.collection';
import { albumCollection } from '@/collections/album.collection';
import type { AlbumLike } from '@melody-manager/shared';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { useAuthUser } from './use-auth-user';

export function useAlbumLikes() {
  const user = useAuthUser();
  const { data: albumLikes = [] } = useLiveQuery((q) => q.from({ albumLikes: albumLikeCollection }));

  const isLiked = useCallback(
    (albumId: string) => {
      return albumLikes.some((like) => like.album === albumId);
    },
    [albumLikes],
  );

  const toggleLike = useCallback(
    (albumId: string) => {
      const albumLike = albumLikes.find((like) => like.album === albumId);
      if (albumLike) {
        albumLikeCollection.delete(albumLike.id);
      } else {
        albumLikeCollection.insert({ id: 'tmp', user: user.id, album: albumId } as AlbumLike);
      }
    },
    [albumLikes, user.id],
  );

  return {
    albumLikes,
    isLiked,
    toggleLike,
  };
}

export function useLikedAlbumIds() {
  const { data: joinResult = [] } = useLiveQuery((q) =>
    q
      .from({ albumLikes: albumLikeCollection })
      .innerJoin({ album: albumCollection }, ({ albumLikes, album }) => eq(albumLikes.album, album.id))
      .select(({ album }) => ({ id: album.id })),
  );
  const ids = useMemo(() => joinResult.map((r) => r.id), [joinResult]);
  return { data: ids };
}
