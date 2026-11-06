import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { TrackPreview } from '@/shared';

export const tracksClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      addFromUrl: (url: string) => http.post('/tracks/add', { url }),
      previewFromUrl: (url: string, options?: { signal?: AbortSignal }) => http.post<TrackPreview>('/tracks/preview', { url }, options),
      getPeaks: (trackId: string) => http.get<{ peaks: number[] }>(`/tracks/${encodeURIComponent(trackId)}/peaks`),
    };
  }),
);
