import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { internalMiddleware } from '../middlewares';
import { playlistService } from '../services';

const refreshPlaylistsSchema = z.object({
  userId: z.string().min(1),
});

export const internalRoute = new Hono().use('*', internalMiddleware).post('/playlists/refresh', zValidator('json', refreshPlaylistsSchema), async (c) => {
  const { userId } = c.req.valid('json');

  try {
    const result = await playlistService.refreshSmartPlaylistsForUser(userId);
    return c.json({ ok: true, ...result });
  } catch (error) {
    logger.error(`[internal] Failed to refresh smart playlists for user ${userId}: ${error}`);
    return c.json({ error: 'Failed to refresh smart playlists' }, 500);
  }
});
