import type { Artist } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const artistRepository = databaseRepositoryFactory<Artist>('artists');
