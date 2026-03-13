import { trackDislikeCollection } from '@/collections/track-dislike.collection';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { TrackDislike } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { useAuthUser } from './use-auth-user';

export function useTrackDislikes() {
  const user = useAuthUser();
  const { removeFromQueue } = useMusicPlayer();
  const { data: trackDislikes = [] } = useLiveQuery((q) => q.from({ trackDislikes: trackDislikeCollection }));

  const isDisliked = useCallback(
    (trackId: string) => {
      return trackDislikes.some((dislike) => dislike.track === trackId);
    },
    [trackDislikes],
  );

  const toggleDislike = useCallback(
    (trackId: string) => {
      const trackDislike = trackDislikes.find((dislike) => dislike.track === trackId);
      if (trackDislike) {
        trackDislikeCollection.delete(trackDislike.id);
      } else {
        trackDislikeCollection.insert({ id: 'tmp', user: user.id, track: trackId } as TrackDislike);
        removeFromQueue(trackId);
      }
    },
    [trackDislikes, user.id, removeFromQueue],
  );

  return {
    trackDislikes,
    isDisliked,
    toggleDislike,
  };
}
