import type { Connection } from '@melody-manager/shared';
import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

const recordService = pb.collection<Connection>('connections');

export const connectionCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
