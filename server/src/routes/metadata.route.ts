import { Hono } from 'hono';
import { logger } from '../lib/logger';
import { adminMiddleware } from '../middlewares';
import { metadataEnrichmentService } from '../services';

export const metadataRoute = new Hono().post('/enrich', adminMiddleware, async (c) => {
  try {
    const { taskId } = await metadataEnrichmentService.enrichAll();
    return c.json({ taskId });
  } catch (error) {
    logger.error(`Error enriching metadata: ${error}`);
    return c.json({ error: 'Failed to enrich metadata' }, 500);
  }
});
