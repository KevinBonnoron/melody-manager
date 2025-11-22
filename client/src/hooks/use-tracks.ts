import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { trackCollection } from '@/collections/track.collection';

export function useTracks() {
  return useLiveQuery((q) => q.from({ tracks: trackCollection }));
}

export function useAlbumTracks(albumId: string) {
  return useLiveQuery((q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.album, albumId)), [albumId]);
}

export function useArtistTracks(artistId: string) {
  return useLiveQuery(
    (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => inArray(artistId, tracks.artists)),
    [artistId],
  );
}
