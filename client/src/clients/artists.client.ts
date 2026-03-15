import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import { universalClient, withMethods } from 'universal-client';

export const artistsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/artists/add', { url }),
      delete: (artistId: string) => http.delete(`/artists/${artistId}`),
    };
  }),
);
