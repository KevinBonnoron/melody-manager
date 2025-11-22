import type { Album } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const albumRepository = databaseRepositoryFactory<Album>('albums', { expand: 'artists' });
