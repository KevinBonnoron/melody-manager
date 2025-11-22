import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { trackSourceService } from '../services';
import { logger } from '../lib/logger';

const addPlaylistSchema = z.object({
  url: z.string().url(),
});

export const playlistRoute = new Hono().post('/add', zValidator('json', addPlaylistSchema), async (c) => {
  const { url } = c.req.valid('json');

  try {
    const tracks = await trackSourceService.addPlaylistFromUrl(url);
    return c.json({ tracks, count: tracks.length });
  } catch (error) {
    logger.error(`Error adding playlist: ${error}`);
    const message = error instanceof Error ? error.message : 'Failed to add playlist';
    return c.json({ error: message }, 500);
  }
});
