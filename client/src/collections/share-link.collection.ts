import type { ShareLink } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<ShareLink>('share_links');
export const shareLinkCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'track',
    },
  }),
);
