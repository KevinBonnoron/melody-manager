import { pb } from '@/lib/pocketbase';
import type { Track } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<Track>('tracks');

export const trackCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'provider,artists,album,genres',
    },
  }),
);
