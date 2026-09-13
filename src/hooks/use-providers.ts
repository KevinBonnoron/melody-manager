import { eq, useLiveQuery } from '@tanstack/react-db';
import { providerCollection } from '@/collections/provider.collection';

export function useProviders(options?: { category?: string; enabled?: boolean }) {
  return useLiveQuery({
    query: (q) => {
      let query = q.from({ providers: providerCollection });
      if (options?.category !== undefined) {
        query = query.where(({ providers }) => eq(providers.category, options.category));
      }

      if (options?.enabled !== undefined) {
        query = query.where(({ providers }) => eq(providers.enabled, options.enabled));
      }

      return query;
    },
  });
}
