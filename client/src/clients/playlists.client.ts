import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/env';
import { universalClient, withMethods } from 'universal-client';

export const playlistsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/playlists/add', { url }),
    };
  }),
);
