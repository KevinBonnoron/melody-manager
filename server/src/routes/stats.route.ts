import { Hono } from 'hono';
import { statsService } from '../services/stats.service';

export const statsRoute = new Hono()
  .get('/play-counts', async (c) => {
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const counts = await statsService.getPlayCounts(userId);
    return c.json(counts);
  })
  .get('/overview', async (c) => {
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const overview = await statsService.getOverview(userId);
    return c.json(overview);
  });
