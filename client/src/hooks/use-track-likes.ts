import { trackLikeCollection } from '@/collections/track-like.collection';
import { trackCollection } from '@/collections/track.collection';
import type { Track, TrackLike } from '@melody-manager/shared';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { useAuthUser } from './use-auth-user';

export function useTrackLikes() {
  const user = useAuthUser();
  const { data: trackLikes = [] } = useLiveQuery((q) => q.from({ trackLikes: trackLikeCollection }));

  const isLiked = useCallback(
    (trackId: string) => {
      return trackLikes.some((like) => like.track === trackId);
    },
    [trackLikes],
  );

  const toggleLike = useCallback(
    (trackId: string) => {
      const trackLike = trackLikes.find((like) => like.track === trackId);
      if (trackLike) {
        trackLikeCollection.delete(trackLike.id);
      } else {
        trackLikeCollection.insert({ id: 'tmp', user: user.id, track: trackId } as TrackLike);
      }
    },
    [trackLikes, user.id],
  );

  return {
    trackLikes,
    isLiked,
    toggleLike,
  };
}

export function useLikedTracks() {
  const { data = [] } = useLiveQuery((q) =>
    q
      .from({ trackLikes: trackLikeCollection })
      .innerJoin({ track: trackCollection }, ({ trackLikes, track }) => eq(trackLikes.track, track.id))
      .select(({ track }) => ({ ...track })),
  );

  return { data: data as Track[] };
}
