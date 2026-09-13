import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { Task } from '@/shared';

export const libraryClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      scan: () => http.post<Task>('/local/scan', {}),
    };
  }),
);
