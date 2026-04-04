import type { Album } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Album>('albums');
export const albumCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'artists',
    },
  }),
);
