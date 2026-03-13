import type { TrackPlay } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { trackPlayCollection } from '@/collections/track-play.collection';

export function useTrackPlays() {
  const { data: trackPlays = [] } = useLiveQuery((q) => q.from({ trackPlays: trackPlayCollection }));

  const playCountByTrackId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of trackPlays as TrackPlay[]) {
      map.set(p.track, p.count);
    }
    return map;
  }, [trackPlays]);

  const getPlayCount = useCallback(
    (trackId: string) => {
      return playCountByTrackId.get(trackId) ?? 0;
    },
    [playCountByTrackId],
  );

  return { getPlayCount };
}
