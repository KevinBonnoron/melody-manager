import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Provider } from '@/shared';

const recordService = pb.collection<Provider>('provider_settings');
export const providerCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
providerCollection.createIndex((row) => row.id, { indexType: BasicIndex });
providerCollection.createIndex((row) => row.type, { indexType: BasicIndex });
providerCollection.createIndex((row) => row.category, { indexType: BasicIndex });
providerCollection.createIndex((row) => row.enabled, { indexType: BasicIndex });
