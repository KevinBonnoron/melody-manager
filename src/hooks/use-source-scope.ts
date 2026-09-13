import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { trackCollection } from '@/collections/track.collection';
import type { Track } from '@/shared';

// Albums and artists carry no source of their own, so a source is resolved
// through the tracks that reference them. Null sets mean "every source".
export function useSourceScope(source?: string) {
  const { data: tracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });

  return useMemo(() => {
    if (!source) {
      return { albumIds: null, artistIds: null, trackCount: tracks.length };
    }

    const albumIds = new Set<string>();
    const artistIds = new Set<string>();
    let trackCount = 0;
    for (const track of tracks as Track[]) {
      if (track.source !== source) {
        continue;
      }

      trackCount += 1;
      if (track.album) {
        albumIds.add(track.album);
      }

      for (const artistId of track.artists ?? []) {
        artistIds.add(artistId);
      }
    }

    return { albumIds, artistIds, trackCount };
  }, [source, tracks]);
}
