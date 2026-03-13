import { pb } from '@/lib/pocketbase';
import type { TrackPlay } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<TrackPlay>('track_plays');

export const trackPlayCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
