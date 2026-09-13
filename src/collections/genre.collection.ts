import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Genre } from '@/shared';

const recordService = pb.collection<Genre>('genres');
export const genreCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
genreCollection.createIndex((row) => row.id, { indexType: BasicIndex });
