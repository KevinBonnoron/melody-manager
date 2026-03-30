import { pb } from '@/lib/pocketbase';
import type { ProviderGrant } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<ProviderGrant>('provider_grants');

export const providerGrantsCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
