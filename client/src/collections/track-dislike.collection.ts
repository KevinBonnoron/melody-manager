import { pb } from '@/lib/pocketbase';
import type { TrackDislike } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<TrackDislike>('track_dislikes');

export const trackDislikeCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
