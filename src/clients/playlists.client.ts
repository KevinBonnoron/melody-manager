import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const playlistsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/playlists/add', { url }),
      update: (id: string, data: { name?: string; description?: string; tracks?: string[] }) => http.put(`/playlists/${id}`, data),
      delete: (id: string) => http.delete(`/playlists/${id}`),
      addTracks: (id: string, trackIds: string[]) => http.post(`/playlists/${id}/tracks`, { trackIds }),
      removeTrack: (id: string, trackId: string) => http.delete(`/playlists/${id}/tracks/${trackId}`),
    };
  }),
);
