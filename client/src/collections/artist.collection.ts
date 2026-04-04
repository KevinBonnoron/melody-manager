import type { Artist } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Artist>('artists');
export const artistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {},
  }),
);
