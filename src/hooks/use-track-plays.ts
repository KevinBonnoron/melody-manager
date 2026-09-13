import { useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { trackPlayCollection } from '@/collections/track-play.collection';
import type { TrackPlay } from '@/shared';

// Counted from the rows the collection already holds. The endpoint that used to
// answer this did the same grouping server-side, then had to be told about
// every new play through a realtime subscription of its own, in parallel with
// the one the collection already keeps.
export function useTrackPlays() {
  const { data = [] } = useLiveQuery({ query: (q) => q.from({ plays: trackPlayCollection }) });

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const play of data as unknown as TrackPlay[]) {
      out.set(play.track, (out.get(play.track) ?? 0) + 1);
    }
    return out;
  }, [data]);

  const getPlayCount = useCallback((trackId: string) => counts.get(trackId) ?? 0, [counts]);
  return { getPlayCount };
}
