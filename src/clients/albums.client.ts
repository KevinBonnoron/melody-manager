import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const albumsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/albums/add', { url }),
      download: (albumId: string) => http.post(`/albums/${albumId}/download`, {}),
      resync: (albumId: string) => http.post<{ taskId: string }>(`/albums/${albumId}/resync`, {}),
      check: (albumId: string) => http.post<{ checked: number; changed: number; lost: number }>(`/albums/${albumId}/check`, {}),
      refreshCover: (albumId: string) => http.post(`/albums/${albumId}/cover`, {}),
      delete: (albumId: string) => http.delete(`/albums/${albumId}`),
      // Renaming moves the folders on disk with the record, so it goes through
      // the API rather than the collection.
      update: (albumId: string, body: { name?: string; artist?: string }) => http.patch(`/albums/${albumId}`, body),
    };
  }),
);
