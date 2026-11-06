import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { playlistCollection } from '@/collections/playlist.collection';
import { playlistRatingCollection } from '@/collections/rating.collection';
import type { Playlist } from '@/shared';

export function usePlaylists() {
  const { data: ratings = [] } = useLiveQuery({ query: (q) => q.from({ ratings: playlistRatingCollection }).where(({ ratings }) => eq(ratings.value, 'like')) });
  const playlistIds = useMemo(() => ratings.map((rating) => rating.playlist).sort(), [ratings]);
  const { data, isLoading } = useLiveQuery({ query: (q) => q.from({ playlists: playlistCollection }).where(({ playlists }) => inArray(playlists.id, playlistIds.length > 0 ? playlistIds : [''])) });
  return { data, isLoading };
}

export function usePlaylist(playlistId: string) {
  return useLiveQuery({
    query: (q) =>
      q
        .from({ playlists: playlistCollection })
        .where(({ playlists }) => eq(playlists.id, playlistId))
        .findOne(),
  });
}

export function useSmartPlaylists() {
  const { data: rawPlaylists = [], isLoading } = usePlaylists();
  const playlists = rawPlaylists as unknown as Playlist[];
  const smartPlaylists = useMemo(() => playlists.filter((p) => p.type === 'smart' && p.tracks.length > 0), [playlists]);
  return { data: smartPlaylists, isLoading };
}

export function useManualPlaylists() {
  const { data: playlists = [], isLoading } = usePlaylists();
  const manualPlaylists = useMemo(() => playlists.filter((p) => p.type !== 'smart'), [playlists]);
  return { data: manualPlaylists, isLoading };
}

export function useLikedPlaylistIds() {
  const { data: joinResult = [] } = useLiveQuery({
    query: (q) =>
      q
        .from({ ratings: playlistRatingCollection })
        .where(({ ratings }) => eq(ratings.value, 'like'))
        .innerJoin({ playlist: playlistCollection }, ({ ratings, playlist }) => eq(ratings.playlist, playlist.id))
        .select(({ playlist }) => ({ id: playlist.id })),
  });
  const ids = useMemo(() => joinResult.map((r) => r.id), [joinResult]);
  return { data: ids };
}
