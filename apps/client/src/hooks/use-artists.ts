import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { artistCollection } from '@/collections/artist.collection';
import type { Artist } from '@/shared';
import { useLibraryIndex } from './use-library-index';

export function useArtists(): { data: Artist[]; isLoading: boolean } {
  const { artistList, loading } = useLibraryIndex();
  return { data: artistList, isLoading: loading.artists };
}

export function useArtist(artistId: string) {
  return useLiveQuery({
    query: (q) =>
      q
        .from({ artists: artistCollection })
        .where(({ artists }) => eq(artists.id, artistId))
        .findOne(),
  });
}

export function useArtistsByIds(ids: string[]) {
  return useLiveQuery({ query: (q) => q.from({ artists: artistCollection }).where(({ artists }) => inArray(artists.id, ids)) });
}
