import type { Genre } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Genre>('genres');
export const genreCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
