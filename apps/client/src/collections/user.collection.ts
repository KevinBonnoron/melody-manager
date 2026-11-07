import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';
import type { User } from '@/shared';

const recordService = pb.collection<User>('users');
export const userCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

userCollection.createIndex((row) => row.id, { indexType: BasicIndex });
