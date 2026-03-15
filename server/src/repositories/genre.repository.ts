import type { Genre } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const genreRepository = databaseRepositoryFactory(pb.collection<Genre>('genres'));
