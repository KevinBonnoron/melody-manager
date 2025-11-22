import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { providerCollection } from '@/collections/provider.collection';

export function useProviders(options?: { category?: string; enabled?: boolean }) {
  return useLiveQuery(
    (q) => {
      let query = q.from({ providers: providerCollection });

      if (options?.category !== undefined && options?.enabled !== undefined) {
        query = query.where(({ providers }) => and(eq(providers.category, options.category), eq(providers.enabled, options.enabled)));
      } else if (options?.category !== undefined) {
        query = query.where(({ providers }) => eq(providers.category, options.category));
      } else if (options?.enabled !== undefined) {
        query = query.where(({ providers }) => eq(providers.enabled, options.enabled));
      }

      return query;
    },
    [options?.category, options?.enabled],
  );
}
