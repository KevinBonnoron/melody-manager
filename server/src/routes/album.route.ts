import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { AlbumError } from '../errors';
import { adminMiddleware } from '../lib/auth';
import { logger } from '../lib/logger';
import { albumService, trackSourceService } from '../services';

const addAlbumSchema = z.object({
  url: z.string().url(),
});

const idParam = z.object({
  id: z.string(),
});

export const albumRoute = new Hono()
  .post('/add', zValidator('json', addAlbumSchema), async (c) => {
    const { url } = c.req.valid('json');
    const userId = c.get('userId') as string | null;

    try {
      const task = await trackSourceService.addAlbumFromUrl(url, userId);
      return c.json({ taskId: task.id });
    } catch (error) {
      logger.error(`Error adding album: ${error}`);
      const message = error instanceof Error ? error.message : 'Failed to add album';
      return c.json({ error: message }, 500);
    }
  })
  .post('/:id/download', zValidator('param', idParam), async (c) => {
    const { id: albumId } = c.req.valid('param');

    try {
      const task = await albumService.download(albumId);
      return c.json({ taskId: task.id });
    } catch (error) {
      if (error instanceof AlbumError) {
        return c.json({ error: error.message }, error.status as 400 | 404);
      }
      logger.error(`Error downloading album: ${error}`);
      return c.json({ error: 'Failed to download album' }, 500);
    }
  })
  .post('/:id/resync', zValidator('param', idParam), async (c) => {
    const { id: albumId } = c.req.valid('param');

    try {
      const task = await albumService.resync(albumId);
      return c.json({ taskId: task.id });
    } catch (error) {
      if (error instanceof AlbumError) {
        return c.json({ error: error.message }, error.status as 400 | 404);
      }
      logger.error(`Error resyncing album: ${error}`);
      return c.json({ error: 'Failed to resync album' }, 500);
    }
  })
  .delete('/:id', adminMiddleware, zValidator('param', idParam), async (c) => {
    const { id: albumId } = c.req.valid('param');

    try {
      const success = await albumService.delete(albumId);
      if (!success) {
        return c.json({ error: 'Album not found' }, 404);
      }
      return c.json({ message: 'Album deleted successfully' });
    } catch (error) {
      logger.error(`Error deleting album: ${error}`);
      return c.json({ error: 'Failed to delete album' }, 500);
    }
  });
