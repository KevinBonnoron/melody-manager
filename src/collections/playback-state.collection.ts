import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { PlaybackState } from '@/shared';

const recordService = pb.collection<PlaybackState>('playback_state');
export const playbackStateCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
playbackStateCollection.createIndex((row) => row.id, { indexType: BasicIndex });
playbackStateCollection.createIndex((row) => row.user, { indexType: BasicIndex });
