import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { Task } from '@/shared';

export const tasksClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      list: () => http.get<{ tasks: Task[] }>('/tasks'),
      clearCompleted: () => http.delete('/tasks/completed'),
    };
  }),
);
