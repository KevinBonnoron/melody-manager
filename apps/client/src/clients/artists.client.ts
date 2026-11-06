import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const artistsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/artists/add', { url }),
      delete: (artistId: string) => http.delete(`/artists/${artistId}`),
      update: (artistId: string, body: { name: string }) => http.patch(`/artists/${artistId}`, body),
    };
  }),
);
