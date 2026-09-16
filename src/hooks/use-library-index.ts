import { useLiveQuery } from '@tanstack/react-db';
import { createContext, createElement, type ReactNode, useContext, useMemo } from 'react';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { genreCollection } from '@/collections/genre.collection';
import { trackCollection } from '@/collections/track.collection';
import type { Album, Artist, Genre, Track } from '@/shared';

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

interface LibraryIndex {
  albums: Map<string, Album>;
  artists: Map<string, Artist>;
  genres: Map<string, Genre>;
  tracks: Map<string, Track>;
}

const empty: LibraryIndex = { albums: new Map(), artists: new Map(), genres: new Map(), tracks: new Map() };
const LibraryIndexContext = createContext<LibraryIndex>(empty);

export function LibraryIndexProvider({ children }: { children: ReactNode }) {
  const { data: albums = [] } = useLiveQuery({ query: (q) => q.from({ albums: albumCollection }) });
  const { data: artists = [] } = useLiveQuery({ query: (q) => q.from({ artists: artistCollection }) });
  const { data: genres = [] } = useLiveQuery({ query: (q) => q.from({ genres: genreCollection }) });
  const { data: tracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });

  const value = useMemo<LibraryIndex>(
    () => ({
      albums: byId(albums as unknown as Album[]),
      artists: byId(artists as unknown as Artist[]),
      genres: byId(genres as unknown as Genre[]),
      tracks: byId(tracks as unknown as Track[]),
    }),
    [albums, artists, genres, tracks],
  );

  return createElement(LibraryIndexContext.Provider, { value }, children);
}

export function useAlbumsById(): Map<string, Album> {
  return useContext(LibraryIndexContext).albums;
}

export function useArtistsById(): Map<string, Artist> {
  return useContext(LibraryIndexContext).artists;
}

export function useGenresById(): Map<string, Genre> {
  return useContext(LibraryIndexContext).genres;
}

export function useTracksById(): Map<string, Track> {
  return useContext(LibraryIndexContext).tracks;
}

export function resolveAll<T>(ids: readonly string[] | undefined, index: Map<string, T>): T[] {
  if (!ids) {
    return [];
  }

  const out: T[] = [];
  for (const id of ids) {
    const row = index.get(id);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

export function artistNames(ids: readonly string[] | undefined, index: Map<string, Artist>): string {
  return resolveAll(ids, index)
    .map((artist) => artist.name)
    .join(', ');
}
