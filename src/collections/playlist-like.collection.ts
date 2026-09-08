import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { PlaylistLike } from '@/shared';

const recordService = pb.collection<PlaylistLike>('playlist_likes');
export const playlistLikeCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'playlist',
    },
  }),
);
