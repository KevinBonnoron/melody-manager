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

// The whole library, kept live once for the app. A live query over a whole
// collection is not cheap to start: every row goes through a fresh query graph,
// which on a phone took most of a second each time a page opened. Hooks that
// want everything read it from here instead of starting their own.
interface LibraryIndex {
  albums: Map<string, Album>;
  artists: Map<string, Artist>;
  genres: Map<string, Genre>;
  tracks: Map<string, Track>;
  // The albums something can be played from: an album whose tracks have all
  // gone stays in its collection, and has nothing to offer.
  playableAlbums: Album[];
  artistList: Artist[];
  trackList: Track[];
  loading: { albums: boolean; artists: boolean; tracks: boolean };
}

const empty: LibraryIndex = {
  albums: new Map(),
  artists: new Map(),
  genres: new Map(),
  tracks: new Map(),
  playableAlbums: [],
  artistList: [],
  trackList: [],
  loading: { albums: true, artists: true, tracks: true },
};
const LibraryIndexContext = createContext<LibraryIndex>(empty);

export function LibraryIndexProvider({ children }: { children: ReactNode }) {
  const { data: albums = [], isLoading: albumsLoading } = useLiveQuery({ query: (q) => q.from({ albums: albumCollection }) });
  const { data: artists = [], isLoading: artistsLoading } = useLiveQuery({ query: (q) => q.from({ artists: artistCollection }) });
  const { data: genres = [] } = useLiveQuery({ query: (q) => q.from({ genres: genreCollection }) });
  const { data: tracks = [], isLoading: tracksLoading } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });

  const value = useMemo<LibraryIndex>(() => {
    const albumList = albums as unknown as Album[];
    const trackList = tracks as unknown as Track[];
    const played = new Set(trackList.map((track) => track.album));
    return {
      albums: byId(albumList),
      artists: byId(artists as unknown as Artist[]),
      genres: byId(genres as unknown as Genre[]),
      tracks: byId(trackList),
      playableAlbums: albumList.filter((album) => played.has(album.id)),
      artistList: artists as unknown as Artist[],
      trackList,
      loading: { albums: albumsLoading, artists: artistsLoading, tracks: tracksLoading },
    };
  }, [albums, artists, genres, tracks, albumsLoading, artistsLoading, tracksLoading]);

  return createElement(LibraryIndexContext.Provider, { value }, children);
}

export function useLibraryIndex(): LibraryIndex {
  return useContext(LibraryIndexContext);
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
