import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import { universalClient, withMethods } from 'universal-client';

export const albumsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/albums/add', { url }),
      download: (albumId: string) => http.post(`/albums/${albumId}/download`, {}),
      resync: (albumId: string) => http.post<{ taskId: string }>(`/albums/${albumId}/resync`, {}),
    };
  }),
);
