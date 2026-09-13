import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Artist } from '@/shared';

const recordService = pb.collection<Artist>('artists');
export const artistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {},
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
artistCollection.createIndex((row) => row.id, { indexType: BasicIndex });
