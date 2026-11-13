import { useMemo } from 'react';
import { useLibraryIndex } from './use-library-index';

export function useSourceScope(source?: string) {
  const tracks = useLibraryIndex().trackList;

  return useMemo(() => {
    if (!source) {
      return { albumIds: null, artistIds: null, trackCount: tracks.length };
    }

    const albumIds = new Set<string>();
    const artistIds = new Set<string>();
    let trackCount = 0;
    for (const track of tracks) {
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
