import { databaseServiceFactory } from '../factories';
import { shareLinkRepository } from '../repositories';

export const shareLinkService = databaseServiceFactory(shareLinkRepository, {
  async resolveToken(token: string) {
    const shareLink = await shareLinkRepository.getOneBy(`token = "${token}"`);
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
