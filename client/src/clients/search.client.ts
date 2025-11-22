import type { Album, Artist, SearchResult, SearchType, Track } from '@melody-manager/shared';
import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const searchClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      search: (query: string, type: SearchType = 'track', source: 'library' | 'providers' = 'providers') => {
        if (source === 'library') {
          return http.post<{ tracks: Track[]; albums: Album[]; artists: Artist[] }>('/search', { query, source: 'library' });
        }
        return http.post<{ results: SearchResult[] }>('/search', { query, type, source: 'providers' });
      },
      searchTracks: (query: string) => http.post<{ results: SearchResult[] }>('/search', { query, type: 'track', source: 'providers' }),
      searchLibrary: (query: string) => http.post<{ tracks: Track[]; albums: Album[]; artists: Artist[] }>('/search', { query, source: 'library' }),
    };
  }),
);
