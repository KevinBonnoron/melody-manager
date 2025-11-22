import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { artistService, trackSourceService } from '../services';
import { logger } from '../lib/logger';

const id = z.object({
  id: z.string(),
});

const addArtistSchema = z.object({
  url: z.string().url(),
});

export const artistRoute = new Hono()
  .post('/add', zValidator('json', addArtistSchema), async (c) => {
    const { url } = c.req.valid('json');

    try {
      const tracks = await trackSourceService.addArtistFromUrl(url);
      return c.json({ tracks, count: tracks.length });
    } catch (error) {
      logger.error(`Error adding artist: ${error}`);
      const message = error instanceof Error ? error.message : 'Failed to add artist';
      return c.json({ error: message }, 500);
    }
  })
  .delete('/:id', zValidator('param', id), async (c) => {
    const { id: artistId } = c.req.valid('param');

    try {
      const success = await artistService.delete(artistId);
      if (!success) {
        return c.json({ error: 'Artist not found' }, 404);
      }
      return c.json({ message: 'Artist deleted successfully' });
    } catch (error) {
      logger.error(`Error deleting artist: ${error}`);
      return c.json({ error: 'Failed to delete artist' }, 500);
    }
  });
