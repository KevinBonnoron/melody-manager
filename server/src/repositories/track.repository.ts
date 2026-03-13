import type { Track } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const trackRepository = databaseRepositoryFactory<Track>('tracks', { expand: 'provider,artists,album' });
