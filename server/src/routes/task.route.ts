import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { taskService } from '../services';

export const taskRoute = new Hono()
  .get('/', (c) => {
    return c.json({ tasks: taskService.getAll() });
  })

  .delete('/completed', (c) => {
    taskService.clearCompleted();
    return c.json({ ok: true });
  })

  .get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      // Send current tasks on connect
      for (const task of taskService.getAll()) {
        await stream.writeSSE({
          data: JSON.stringify(task),
          event: 'task',
        });
      }

      const unsubscribe = taskService.onUpdate((task) => {
        stream
          .writeSSE({
            data: JSON.stringify(task),
            event: 'task',
          })
          .catch(() => unsubscribe());
      });

      // Keep the stream alive until the client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    });
  });
