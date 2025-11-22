import type { TrackPlay } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback } from 'react';
import { trackPlayCollection } from '@/collections/track-play.collection';

export function useTrackPlays() {
  const { data: trackPlays = [] } = useLiveQuery((q) => q.from({ trackPlays: trackPlayCollection }));

  const getPlayCount = useCallback(
    (trackId: string) => {
      return (trackPlays as TrackPlay[]).find((p) => p.track === trackId)?.count ?? 0;
    },
    [trackPlays],
  );

  return { getPlayCount };
}
