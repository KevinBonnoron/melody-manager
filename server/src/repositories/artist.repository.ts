import type { Artist } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const artistRepository = databaseRepositoryFactory(pb.collection<Artist>('artists'));
