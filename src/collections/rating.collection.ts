import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { AlbumRating, ArtistRating, PlaylistRating, TrackRating } from '@/shared';

// One collection per entity, so the relation stays typed and a deleted album
// still takes its ratings with it. Built from one place because the four are
// otherwise the same collection four times over.
function ratingCollection<T extends { id: string; user: string }>(name: string, target: (row: T) => string) {
  const collection = createCollection(pocketbaseCollectionOptions({ recordService: pb.collection<T>(name) }));
  // Joins resolve on `id`; without an index TanStack DB scans the whole collection.
  collection.createIndex((row) => row.id, { indexType: BasicIndex });
  collection.createIndex((row) => target(row as unknown as T), { indexType: BasicIndex });
  collection.createIndex((row) => row.user, { indexType: BasicIndex });
  return collection;
}

export const trackRatingCollection = ratingCollection<TrackRating>('track_ratings', (row) => row.track);
export const albumRatingCollection = ratingCollection<AlbumRating>('album_ratings', (row) => row.album);
export const artistRatingCollection = ratingCollection<ArtistRating>('artist_ratings', (row) => row.artist);
export const playlistRatingCollection = ratingCollection<PlaylistRating>('playlist_ratings', (row) => row.playlist);
