import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { artistCollection } from '@/collections/artist.collection';

export function useArtists() {
  return useLiveQuery((q) => q.from({ artists: artistCollection }));
}

export function useArtist(artistId: string) {
  return useLiveQuery(
    (q) =>
      q
        .from({ artists: artistCollection })
        .where(({ artists }) => eq(artists.id, artistId))
        .findOne(),
    [artistId],
  );
}

export function useArtistsByIds(ids: string[]) {
  return useLiveQuery((q) => q.from({ artists: artistCollection }).where(({ artists }) => inArray(artists.id, ids)), [ids.join(',')]);
}
