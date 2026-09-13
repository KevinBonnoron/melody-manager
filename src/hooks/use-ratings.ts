import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { albumRatingCollection, artistRatingCollection, playlistRatingCollection, trackRatingCollection } from '@/collections/rating.collection';
import { trackCollection } from '@/collections/track.collection';
import type { RatingValue, Track } from '@/shared';
import { useAuthUser } from './use-auth-user';

// The four collections differ only by the name of the field pointing at what is
// rated, so one of them stands for all four here and the field travels as a
// string. The public hooks below are what the screens see.
type RatingCollection = typeof trackRatingCollection;
type Rating = { id: string; user: string; value: RatingValue } & Record<string, unknown>;

// One implementation for the four entities. They used to be four copies of this
// file differing by a field name, which is how one of them ended up not
// filtering on the current user at all.
function useRatings(collection: RatingCollection, field: string) {
  const user = useAuthUser();
  const { data = [], isReady } = useLiveQuery({ query: (q) => q.from({ ratings: collection }).where(({ ratings }) => eq(ratings.user, user.id)) });
  const ratings = data as unknown as Rating[];

  const ratingOf = useCallback((id: string) => ratings.find((rating) => rating[field] === id), [ratings, field]);
  const isLiked = useCallback((id: string) => ratingOf(id)?.value === 'like', [ratingOf]);
  const isDisliked = useCallback((id: string) => ratingOf(id)?.value === 'dislike', [ratingOf]);

  // Clicking the opinion you already hold takes it back; clicking the other one
  // replaces it, because holding both was the state we just did away with.
  const rate = useCallback(
    (id: string, value: RatingValue) => {
      const current = ratingOf(id);
      if (!current) {
        collection.insert({ id: collection.utils.newId(), user: user.id, [field]: id, value } as never);
        return;
      }
      if (current.value === value) {
        collection.delete(current.id);
        return;
      }

      collection.update(current.id, (draft: { value: RatingValue }) => {
        draft.value = value;
      });
    },
    [collection, field, ratingOf, user.id],
  );

  const toggleLike = useCallback((id: string) => rate(id, 'like'), [rate]);
  const toggleDislike = useCallback((id: string) => rate(id, 'dislike'), [rate]);

  const likedIds = useMemo(() => ratings.filter((rating) => rating.value === 'like').map((rating) => rating[field] as string), [ratings, field]);

  // Until the collection has synced, every answer here is "not rated", which is
  // a claim rather than an answer: the screens use this to hold their state back
  // instead of showing the wrong one and correcting it a second later.
  return { ratings, ratingOf, isLiked, isDisliked, rate, toggleLike, toggleDislike, likedIds, isReady };
}

export const useTrackRatings = () => useRatings(trackRatingCollection, 'track');
export const useAlbumRatings = () => useRatings(albumRatingCollection as unknown as RatingCollection, 'album');
export const useArtistRatings = () => useRatings(artistRatingCollection as unknown as RatingCollection, 'artist');
export const usePlaylistRatings = () => useRatings(playlistRatingCollection as unknown as RatingCollection, 'playlist');

// The library screens want the entities themselves, not the opinions about
// them: an inner join drops a rating whose target has since been deleted.
export function useLikedTracks() {
  const user = useAuthUser();
  const { data = [] } = useLiveQuery({
    query: (q) =>
      q
        .from({ ratings: trackRatingCollection })
        .where(({ ratings }) => and(eq(ratings.user, user.id), eq(ratings.value, 'like')))
        .innerJoin({ track: trackCollection }, ({ ratings, track }) => eq(ratings.track, track.id))
        .select(({ track }) => ({ ...track })),
  });

  return { data: data as unknown as Track[] };
}

export function useLikedAlbumIds() {
  const user = useAuthUser();
  const { data = [] } = useLiveQuery({
    query: (q) =>
      q
        .from({ ratings: albumRatingCollection })
        .where(({ ratings }) => and(eq(ratings.user, user.id), eq(ratings.value, 'like')))
        .innerJoin({ album: albumCollection }, ({ ratings, album }) => eq(ratings.album, album.id))
        .select(({ album }) => ({ id: album.id })),
  });
  const ids = useMemo(() => data.map((row) => row.id as string), [data]);
  return { data: ids };
}

export function useLikedArtistIds() {
  const user = useAuthUser();
  const { data = [] } = useLiveQuery({
    query: (q) =>
      q
        .from({ ratings: artistRatingCollection })
        .where(({ ratings }) => and(eq(ratings.user, user.id), eq(ratings.value, 'like')))
        .innerJoin({ artist: artistCollection }, ({ ratings, artist }) => eq(ratings.artist, artist.id))
        .select(({ artist }) => ({ id: artist.id })),
  });
  const ids = useMemo(() => data.map((row) => row.id as string), [data]);
  return { data: ids };
}
