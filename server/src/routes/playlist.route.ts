import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { trackSourceService } from '../services';

const addPlaylistSchema = z.object({
  url: z.string().url(),
});

export const playlistRoute = new Hono().post('/add', zValidator('json', addPlaylistSchema), async (c) => {
  const { url } = c.req.valid('json');
  const userId = c.get('userId') as string | null;

  try {
    const task = await trackSourceService.addPlaylistFromUrl(url, userId);
    return c.json({ taskId: task.id });
  } catch (error) {
    logger.error(`Error adding playlist: ${error}`);
    const message = error instanceof Error ? error.message : 'Failed to add playlist';
    return c.json({ error: message }, 500);
  }
});
