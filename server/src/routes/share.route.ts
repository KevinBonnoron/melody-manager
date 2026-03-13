import { zValidator } from '@hono/zod-validator';
import { transcodeFormats } from '@melody-manager/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { shareLinkService, trackService } from '../services';

const tokenParam = z.object({
  token: z.string(),
});

const streamSchema = z.object({
  transcode: z.enum(transcodeFormats).optional(),
});

export const shareRoute = new Hono().get('/stream/:token', zValidator('param', tokenParam), zValidator('query', streamSchema), async (c) => {
  const { token } = c.req.valid('param');
  const { transcode } = c.req.valid('query');

  try {
    const shareLink = await shareLinkService.resolveToken(token);
    if (!shareLink) {
      return c.json({ error: 'Share link not found or expired' }, 404);
    }

    return await trackService.streamTrack(c, shareLink.track, transcode);
  } catch (error) {
    logger.error(`Error streaming shared track: ${error}`);
    return c.json({ error: 'Failed to stream track' }, 500);
  }
});
