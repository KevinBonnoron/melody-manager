import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { playlistCollection } from '@/collections/playlist.collection';
import { playlistLikeCollection } from '@/collections/playlist-like.collection';

export function usePlaylists() {
  const { data: playlistLikes = [] } = useLiveQuery((q) => q.from({ playlistLikes: playlistLikeCollection }));
  const playlistIds = useMemo(() => playlistLikes.map((l) => l.playlist).sort(), [playlistLikes]);
  const { data, isLoading } = useLiveQuery((q) => q.from({ playlists: playlistCollection }).where(({ playlists }) => inArray(playlists.id, playlistIds.length > 0 ? playlistIds : [''])), [playlistIds.join(',')]);
  return { data, isLoading };
}

export function usePlaylist(playlistId: string) {
  return useLiveQuery(
    (q) =>
      q
        .from({ playlists: playlistCollection })
        .where(({ playlists }) => eq(playlists.id, playlistId))
        .findOne(),
    [playlistId],
  );
}

export function useSmartPlaylists() {
  const { data: playlists = [], isLoading } = usePlaylists();
  const smartPlaylists = useMemo(() => playlists.filter((p) => p.type === 'smart' && p.tracks.length > 0), [playlists]);
  return { data: smartPlaylists, isLoading };
}

export function useManualPlaylists() {
  const { data: playlists = [], isLoading } = usePlaylists();
  const manualPlaylists = useMemo(() => playlists.filter((p) => p.type !== 'smart'), [playlists]);
  return { data: manualPlaylists, isLoading };
}

export function useLikedPlaylistIds() {
  const { data: joinResult = [] } = useLiveQuery((q) =>
    q
      .from({ playlistLikes: playlistLikeCollection })
      .innerJoin({ playlist: playlistCollection }, ({ playlistLikes, playlist }) => eq(playlistLikes.playlist, playlist.id))
      .select(({ playlist }) => ({ id: playlist.id })),
  );
  const ids = useMemo(() => joinResult.map((r) => r.id), [joinResult]);
  return { data: ids };
}
