import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Track } from '@/shared';

const recordService = pb.collection<Track>('tracks');
export const trackCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
trackCollection.createIndex((row) => row.id, { indexType: BasicIndex });
trackCollection.createIndex((row) => row.album, { indexType: BasicIndex });
trackCollection.createIndex((row) => row.source, { indexType: BasicIndex });
