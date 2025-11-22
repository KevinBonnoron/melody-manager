import { pb } from '@/lib/pocketbase';
import type { TrackLike } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<TrackLike>('track_likes');

export const trackLikeCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'track,track.album,track.artists,track.genres',
    },
  }),
);
