import type { Connection } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const connectionRepository = databaseRepositoryFactory(pb.collection<Connection>('connections'));
