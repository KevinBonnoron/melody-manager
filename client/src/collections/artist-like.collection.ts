import type { ArtistLike } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<ArtistLike>('artist_likes');
export const artistLikeCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'artist',
    },
  }),
);
