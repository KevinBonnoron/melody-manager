import { CacheService } from '@melody-manager/plugin-sdk';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

export const cacheService = new CacheService(config.cache, logger);
