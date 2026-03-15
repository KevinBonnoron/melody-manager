import type { Track } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const trackRepository = databaseRepositoryFactory(pb.collection<Track>('tracks'), { expand: 'provider,artists,album' });
