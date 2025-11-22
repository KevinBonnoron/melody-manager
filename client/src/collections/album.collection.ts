import { pb } from '@/lib/pocketbase';
import type { Album } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<Album>('albums');

export const albumCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'artists',
    },
  }),
);
