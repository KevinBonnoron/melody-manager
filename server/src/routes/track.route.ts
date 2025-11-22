import { zValidator } from '@hono/zod-validator';
import { transcodeFormats } from '@melody-manager/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { cacheService, trackService, trackSourceService } from '../services';

const id = z.object({
  id: z.string(),
});

const streamSchema = z.object({
  transcode: z.enum(transcodeFormats).optional(),
});

const addSchema = z.object({
  url: z.string().url(),
});

export const trackRoute = new Hono()
  .post('/add', zValidator('json', addSchema), async (c) => {
    const { url } = c.req.valid('json');

    try {
      const existingTrack = await trackService.getOneBy(`sourceUrl = "${url}"`);
      if (existingTrack) {
        return c.json({ tracks: [existingTrack], message: 'Track already exists' });
      }

      const tracks = await trackSourceService.addFromUrl(url);
      return c.json({ tracks, message: 'Track(s) added successfully' });
    } catch (error) {
      logger.error(`Error adding track: ${error}`);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to add track' }, 500);
    }
  })
  .post('/refresh/:id', zValidator('param', id), async (c) => {
    const { id: trackId } = c.req.valid('param');

    try {
      return c.json({ message: 'Refresh not yet implemented' }, 501);
    } catch (error) {
      logger.error(`Error refreshing track: ${error}`);
      return c.json({ error: 'Failed to refresh track' }, 500);
    }
  })
  .get('/stream/:id', zValidator('param', id), zValidator('query', streamSchema), async (c) => {
    const { id: trackId } = c.req.valid('param');
    const { transcode } = c.req.valid('query');

    try {
      return await trackService.streamTrack(c, trackId, transcode);
    } catch (error) {
      logger.error(`Error streaming track: ${error}`);
      return c.json({ error: 'Failed to stream track' }, 500);
    }
  })
  .delete('/:id', zValidator('param', id), async (c) => {
    const { id: trackId } = c.req.valid('param');

    try {
      const success = await trackService.delete(trackId);
      if (!success) {
        return c.json({ error: 'Track not found' }, 404);
      }
      cacheService.invalidate(`track-${trackId}`);
      return c.json({ message: 'Track deleted successfully' });
    } catch (error) {
      logger.error(`Error deleting track: ${error}`);
      return c.json({ error: 'Failed to delete track' }, 500);
    }
  });
