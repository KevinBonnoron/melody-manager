import type { SearchResult, SearchType } from '@melody-manager/shared';
import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const searchClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      search: (query: string, type: SearchType) => http.post<SearchResult[]>('/search', { query, type }),
    };
  }),
);
