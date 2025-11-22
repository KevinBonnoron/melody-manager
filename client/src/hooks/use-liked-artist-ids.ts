import { artistLikeCollection } from '@/collections/artist-like.collection';
import { artistCollection } from '@/collections/artist.collection';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

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
