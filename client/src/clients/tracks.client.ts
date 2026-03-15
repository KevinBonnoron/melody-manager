import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const tracksClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/tracks/add', { url }),
      getPeaks: (trackId: string) => http.get<{ peaks: number[] }>(`/tracks/peaks/${encodeURIComponent(trackId)}`),
      delete: (trackId: string) => http.delete(`/tracks/${encodeURIComponent(trackId)}`),
    };
  }),
);
