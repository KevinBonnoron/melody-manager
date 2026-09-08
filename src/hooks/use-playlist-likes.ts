import { useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { playlistLikeCollection } from '@/collections/playlist-like.collection';
import type { PlaylistLike } from '@/shared';
import { useAuthUser } from './use-auth-user';

export function usePlaylistLikes() {
  const user = useAuthUser();
  const { data: rawPlaylistLikes = [] } = useLiveQuery((q) => q.from({ playlistLikes: playlistLikeCollection }));
  const playlistLikes = rawPlaylistLikes as unknown as PlaylistLike[];

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
