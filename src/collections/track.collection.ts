import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Track } from '@/shared';

const recordService = pb.collection<Track>('tracks');
export const trackCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'artists,album,genres',
    },
  }),
);
