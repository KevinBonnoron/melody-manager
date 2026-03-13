import { databaseServiceFactory } from '../factories';
import { pbFilter } from '../lib/pocketbase';
import { shareLinkRepository } from '../repositories';

export const shareLinkService = databaseServiceFactory(shareLinkRepository, {
  async resolveToken(token: string) {
    const shareLink = await shareLinkRepository.getOneBy(pbFilter('token = {:token}', { token }));
    if (!shareLink) {
      return null;
    }

    if (shareLink.expiresAt) {
      const expiry = new Date(shareLink.expiresAt);
      if (expiry < new Date()) {
        return null;
      }
    }

    return shareLink;
  },
});
