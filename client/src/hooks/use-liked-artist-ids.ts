import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { artistCollection } from '@/collections/artist.collection';
import { artistLikeCollection } from '@/collections/artist-like.collection';

export function useLikedArtistIds() {
  const { data: joinResult = [] } = useLiveQuery((q) =>
    q
      .from({ artistLikes: artistLikeCollection })
      .innerJoin({ artist: artistCollection }, ({ artistLikes, artist }) => eq(artistLikes.artist, artist.id))
      .select(({ artist }) => ({ id: artist.id })),
  );
  const ids = useMemo(() => joinResult.map((r) => r.id), [joinResult]);
  return { data: ids };
}
