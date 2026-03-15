import type { Provider } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const providerRepository = databaseRepositoryFactory(pb.collection<Provider>('providers'));
