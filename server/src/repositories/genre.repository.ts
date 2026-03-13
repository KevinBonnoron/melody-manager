import type { Genre } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const genreRepository = databaseRepositoryFactory<Genre>('genres');
