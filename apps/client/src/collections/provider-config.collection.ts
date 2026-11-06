import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { ProviderConfig } from '@/shared';

const recordService = pb.collection<ProviderConfig>('provider_config');
export const providerConfigCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

providerConfigCollection.createIndex((row) => row.id, { indexType: BasicIndex });
providerConfigCollection.createIndex((row) => row.type, { indexType: BasicIndex });
