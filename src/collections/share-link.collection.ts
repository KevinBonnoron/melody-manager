import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { ShareLink } from '@/shared';

const recordService = pb.collection<ShareLink>('share_links');
export const shareLinkCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

// Joins resolve on `id`; without an index TanStack DB scans the whole collection.
shareLinkCollection.createIndex((row) => row.id, { indexType: BasicIndex });
shareLinkCollection.createIndex((row) => row.track, { indexType: BasicIndex });
