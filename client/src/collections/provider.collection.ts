import type { Provider } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Provider>('providers');

export const providerCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
