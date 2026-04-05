import type { PlaylistLike } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { playlistLikeCollection } from '@/collections/playlist-like.collection';
import { useAuthUser } from './use-auth-user';

export function usePlaylistLikes() {
  const user = useAuthUser();
  const { data: playlistLikes = [] } = useLiveQuery((q) => q.from({ playlistLikes: playlistLikeCollection }));

  const isLiked = useCallback(
    (playlistId: string) => {
      return playlistLikes.some((like) => like.playlist === playlistId);
    },
    [playlistLikes],
  );

  const toggleLike = useCallback(
    (playlistId: string) => {
      const playlistLike = playlistLikes.find((like) => like.playlist === playlistId);
      if (playlistLike) {
        playlistLikeCollection.delete(playlistLike.id);
      } else {
        playlistLikeCollection.insert({ id: 'tmp', user: user.id, playlist: playlistId } as PlaylistLike);
      }
    },
    [playlistLikes, user.id],
  );

  return {
    playlistLikes,
    isLiked,
    toggleLike,
  };
}
