import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Provider } from '@/shared';

const recordService = pb.collection<Provider>('provider_settings');
export const providerCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
