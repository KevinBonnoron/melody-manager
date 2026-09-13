import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Connection } from '@/shared';

const recordService = pb.collection<Connection>('connections');
export const connectionCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
connectionCollection.createIndex((row) => row.id, { indexType: BasicIndex });
connectionCollection.createIndex((row) => row.type, { indexType: BasicIndex });
connectionCollection.createIndex((row) => row.user, { indexType: BasicIndex });
