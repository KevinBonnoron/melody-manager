import { BasicIndex, createCollection } from '@tanstack/react-db';
import { pocketbaseCollectionOptions } from 'pocketbase-db-collection';
import { pb } from '@/lib/pocketbase';

export interface UserSession {
  id: string;
  user: string;
  created: string;
  expiresAt: string;
  ipAddress: string;
  userAgent: string;
}

const recordService = pb.collection<UserSession>('user_sessions');
export const userSessionCollection = createCollection(
  pocketbaseCollectionOptions({
    recordService,
  }),
);

userSessionCollection.createIndex((row) => row.id, { indexType: BasicIndex });
