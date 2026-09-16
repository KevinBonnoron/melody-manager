import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Artist } from '@/shared';

const recordService = pb.collection<Artist>('artists');
export const artistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {},
  }),
);

artistCollection.createIndex((row) => row.id, { indexType: BasicIndex });
