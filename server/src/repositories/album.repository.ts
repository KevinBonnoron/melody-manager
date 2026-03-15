import type { Album } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const albumRepository = databaseRepositoryFactory(pb.collection<Album>('albums'), { expand: 'artists' });
