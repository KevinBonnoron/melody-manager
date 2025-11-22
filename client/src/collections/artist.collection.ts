import { pb } from '@/lib/pocketbase';
import type { Artist } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';

const recordService = pb.collection<Artist>('artists');

export const artistCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
    options: {
      expand: 'albums_via_artists,tracks_via_artists,tracks_via_artists.provider,tracks_via_artists.album,tracks_via_artists.artists,albums_via_artists.tracks_via_album,albums_via_artists.artists',
    },
  }),
);
