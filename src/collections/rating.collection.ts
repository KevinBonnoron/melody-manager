import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { AlbumRating, ArtistRating, PlaylistRating, TrackRating } from '@/shared';

function ratingCollection<T extends { id: string; user: string }>(name: string, target: (row: T) => string) {
  const collection = createCollection(pocketbaseCollectionOptions({ recordService: pb.collection<T>(name) }));
  collection.createIndex((row) => row.id, { indexType: BasicIndex });
  collection.createIndex((row) => target(row as unknown as T), { indexType: BasicIndex });
  collection.createIndex((row) => row.user, { indexType: BasicIndex });
  return collection;
}

export const trackRatingCollection = ratingCollection<TrackRating>('track_ratings', (row) => row.track);
export const albumRatingCollection = ratingCollection<AlbumRating>('album_ratings', (row) => row.album);
export const artistRatingCollection = ratingCollection<ArtistRating>('artist_ratings', (row) => row.artist);
export const playlistRatingCollection = ratingCollection<PlaylistRating>('playlist_ratings', (row) => row.playlist);
