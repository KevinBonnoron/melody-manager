import type { TrackPlay } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<TrackPlay>('track_plays');
export const trackPlayCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
