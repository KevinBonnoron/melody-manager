import type { ShareLink } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';

export const shareLinkRepository = databaseRepositoryFactory<ShareLink>('share_links', { expand: 'track' });
