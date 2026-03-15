import type { ShareLink } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const shareLinkRepository = databaseRepositoryFactory(pb.collection<ShareLink>('share_links'), { expand: 'track' });
