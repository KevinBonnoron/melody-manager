import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { AlbumLike } from '@/shared';

const recordService = pb.collection<AlbumLike>('album_likes');
export const albumLikeCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'album',
    },
  }),
);
