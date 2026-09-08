import { createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { Connection } from '@/shared';

const recordService = pb.collection<Connection>('connections');
export const connectionCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);
