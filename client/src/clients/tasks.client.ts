import { withHttpDelegate, withSseDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { Task } from '@melody-manager/shared';
import { universalClient, withMethods } from 'universal-client';

export const tasksClient = universalClient(
  withHttpDelegate(config.server.url),
  withSseDelegate(config.server.url),
  withMethods(({ http, sse }) => {
    return {
      list: () => http.get<{ tasks: Task[] }>('/tasks'),
      clearCompleted: () => http.delete('/tasks/completed'),

      events: (onTask: (task: Task) => void) => {
        const unsub = sse.subscribe('task', (data) => {
          if (typeof data === 'string') {
            try {
              onTask(JSON.parse(data));
            } catch {
              console.warn('Received malformed SSE data:', data);
            }
          }
        });
        sse.open({ url: '/tasks/events' });
        return () => {
          unsub();
          sse.close();
        };
      },
    };
  }),
);
