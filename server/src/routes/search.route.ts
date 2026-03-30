import { zValidator } from '@hono/zod-validator';
import type { SearchType } from '@melody-manager/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { searchService } from '../services';

const searchSchema = z.object({
  query: z.string().min(1),
  type: z.enum(['track', 'album', 'artist', 'playlist']).optional().default('track'),
  source: z.enum(['library', 'providers']).optional().default('providers'),
});

export const searchRoute = new Hono().post('/', zValidator('json', searchSchema), async (c) => {
  const { query, type, source } = c.req.valid('json');

  try {
    if (source === 'library') {
      const results = await searchService.searchLibrary(query);
      return c.json(results);
    }

    const userId = c.get('userId') as string | null;
    const response = await searchService.search(query, type as SearchType, userId);
    return c.json(response);
  } catch (error) {
    logger.error(`Error searching ${source === 'library' ? 'library' : type}: ${error}`);
    return c.json({ error: `Failed to search ${source === 'library' ? 'library' : type}` }, 500);
  }
});
