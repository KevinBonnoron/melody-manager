import type { Playlist } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Playlist>('playlists');
export const playlistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: '',
    },
  }),
);
