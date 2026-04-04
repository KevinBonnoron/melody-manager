import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const metadataClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      enrichAll: () => http.post<{ taskId: string }>('/metadata/enrich', {}),
    };
  }),
);
