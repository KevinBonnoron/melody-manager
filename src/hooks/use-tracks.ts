import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { trackCollection } from '@/collections/track.collection';
import type { Track } from '@/shared';
import { byPosition } from './track-order';

export function useTracks() {
  return useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });
}

export function useAlbumTracks(albumId: string) {
  const result = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.album, albumId)) });
  const data = useMemo(() => (result.data ? [...(result.data as unknown as Track[])].sort(byPosition) : undefined), [result.data]);

  return { ...result, data };
}

export function useArtistTracks(artistId: string) {
  return useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => inArray(artistId, tracks.artists)) });
}
