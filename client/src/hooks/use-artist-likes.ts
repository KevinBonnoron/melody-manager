import { artistLikeCollection } from '@/collections/artist-like.collection';
import type { ArtistLike } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { useAuthUser } from './use-auth-user';

export function useArtistLikes() {
  const user = useAuthUser();
  const { data: artistLikes = [] } = useLiveQuery((q) => q.from({ artistLikes: artistLikeCollection }));

  const isLiked = useCallback(
    (artistId: string) => {
      return artistLikes.some((like) => like.artist === artistId);
    },
    [artistLikes],
  );

  const toggleLike = useCallback(
    (artistId: string) => {
      const artistLike = artistLikes.find((like) => like.artist === artistId);
      if (artistLike) {
        artistLikeCollection.delete(artistLike.id);
      } else {
        artistLikeCollection.insert({ id: 'tmp', user: user.id, artist: artistId } as ArtistLike);
      }
    },
    [artistLikes, user.id],
  );

  return {
    artistLikes,
    isLiked,
    toggleLike,
  };
}
