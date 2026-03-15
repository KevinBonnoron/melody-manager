import { zValidator } from '@hono/zod-validator';
import { transcodeFormats } from '@melody-manager/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { adminMiddleware } from '../lib/auth';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { pluginRegistry } from '../plugins';
import { trackService, trackSourceService } from '../services';
import { libraryService } from '../services/library.service';

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
    const userId = c.get('userId') as string | null;

    try {
      const existingTrack = await trackService.getOneBy(pbFilter('sourceUrl = {:url}', { url }));
      if (existingTrack) {
        if (userId) {
          await libraryService.autoLikeFromTracks(userId, [existingTrack]);
        }
        return c.json({ tracks: [existingTrack], message: 'Track already exists' });
      }

      const task = await trackSourceService.addFromUrl(url, userId);
      return c.json({ taskId: task.id });
    } catch (error) {
      logger.error(`Error adding track: ${error}`);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to add track' }, 500);
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
  .get('/peaks/:id', zValidator('param', id), async (c) => {
    const { id: trackId } = c.req.valid('param');
    try {
      const peaks = await trackService.getTrackPeaks(trackId);
      return c.json({ peaks });
    } catch (error) {
      logger.error(`Error computing peaks: ${error}`);
      return c.json({ peaks: [] });
    }
  })
  .delete('/:id', adminMiddleware, zValidator('param', id), async (c) => {
    const { id: trackId } = c.req.valid('param');

    try {
      const success = await trackService.delete(trackId);
      if (!success) {
        return c.json({ error: 'Track not found' }, 404);
      }
      pluginRegistry.invalidateCache(`track-${trackId}`);
      return c.json({ message: 'Track deleted successfully' });
    } catch (error) {
      logger.error(`Error deleting track: ${error}`);
      return c.json({ error: 'Failed to delete track' }, 500);
    }
  });
