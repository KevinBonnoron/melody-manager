import { existsSync } from 'node:fs';
import { logger } from './lib/logger';
import { initPocketBase } from './lib/pocketbase';
import { initializeWatchProviders, registerAllProviders } from './providers';
import { trackRepository } from './repositories';
import { app } from './server';

await initPocketBase();
registerAllProviders();

await initializeWatchProviders();

// Clean stale localPath entries for files that no longer exist on disk
(async () => {
  const tracks = await trackRepository.getAllBy('metadata.localPath != null');
  let cleaned = 0;
  for (const track of tracks) {
    const localPath = track.metadata?.localPath as string | undefined;
    if (localPath && !existsSync(localPath)) {
      await trackRepository.update(track.id, {
        metadata: { ...track.metadata, localPath: undefined },
      });
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`Cleaned ${cleaned} stale localPath entries`);
  }
})();

export default {
  port: 3000,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  idleTimeout: 0,
};
