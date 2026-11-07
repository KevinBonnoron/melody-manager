import { useLiveQuery } from '@tanstack/react-db';
import { shareLinkCollection } from '@/collections/share-link.collection';

export function useShareLinks() {
  return useLiveQuery({ query: (q) => q.from({ shareLinks: shareLinkCollection }) });
}
