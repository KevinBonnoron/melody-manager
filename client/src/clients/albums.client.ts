import type { Track } from '@melody-manager/shared';
import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

interface SyncChaptersResponse {
  success: boolean;
  message: string;
  tracks: Track[];
}

export const albumsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/albums/add', { url }),
      syncChapters: (albumId: string) => http.post<SyncChaptersResponse>(`/albums/${albumId}/sync-chapters`, {}),
    };
  }),
);
