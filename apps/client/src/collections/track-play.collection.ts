import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { TrackPlay } from '@/shared';

const recordService = pb.collection<TrackPlay>('track_plays');
export const trackPlayCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

trackPlayCollection.createIndex((row) => row.id, { indexType: BasicIndex });
trackPlayCollection.createIndex((row) => row.track, { indexType: BasicIndex });
trackPlayCollection.createIndex((row) => row.user, { indexType: BasicIndex });
