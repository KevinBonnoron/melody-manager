import type { Track } from '@melody-manager/shared';
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { trackCollection } from '@/collections/track.collection';

export function useTracks() {
  return useLiveQuery((q) => q.from({ tracks: trackCollection }));
}

export function useAlbumTracks(albumId: string) {
  const result = useLiveQuery((q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.album, albumId)), [albumId]);

  const data = useMemo(
    () =>
      result.data
        ? [...result.data].sort((a: Track, b: Track) => {
            const aTime = a.metadata?.startTime;
            const bTime = b.metadata?.startTime;
            if (aTime !== undefined && bTime !== undefined) {
              return aTime - bTime;
            }
            if (aTime !== undefined) {
              return -1;
            }
            if (bTime !== undefined) {
              return 1;
            }
            return 0;
          })
        : undefined,
    [result.data],
  );

  return { ...result, data };
}

export function useArtistTracks(artistId: string) {
  return useLiveQuery((q) => q.from({ tracks: trackCollection }).where(({ tracks }) => inArray(artistId, tracks.artists)), [artistId]);
}
