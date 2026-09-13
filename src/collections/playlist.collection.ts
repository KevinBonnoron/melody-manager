import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Playlist } from '@/shared';

const recordService = pb.collection<Playlist>('playlists');
export const playlistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
playlistCollection.createIndex((row) => row.id, { indexType: BasicIndex });
