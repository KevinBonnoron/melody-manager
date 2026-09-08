import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Playlist } from '@/shared';

const recordService = pb.collection<Playlist>('playlists');
export const playlistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: '',
    },
  }),
);
