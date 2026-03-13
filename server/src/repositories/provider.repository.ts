import type { Provider } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const providerRepository = databaseRepositoryFactory<Provider>('providers');
