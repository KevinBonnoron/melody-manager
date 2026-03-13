import type { PluginManifest, WatchEvent } from '@melody-manager/plugin-sdk';
import { CacheService } from '@melody-manager/plugin-sdk';
import type { TrackProvider } from '@melody-manager/shared';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { pb, pbFilter } from '../lib/pocketbase';
import { albumRepository, artistRepository, providerRepository, trackRepository } from '../repositories';
import { importPersistService, metadataEnrichmentService, taskService } from '../services';
import { pluginRegistry } from './registry';
import type { DevicePlugin, PluginCapabilities, SourcePlugin } from './types';

export const cacheService = new CacheService(config.cache, logger);

const streamDeps = { logger };

pluginRegistry.setCacheInvalidator((key) => cacheService.invalidate(key));

function capabilitiesFromManifest(manifest: PluginManifest): PluginCapabilities {
  return {
    search: manifest.features.includes('search') ? (manifest.searchTypes ?? []) : undefined,
    stream: manifest.features.includes('stream') ? true : undefined,
    import: manifest.features.includes('import') ? (manifest.importTypes ?? []) : undefined,
  };
}

export async function loadPlugins(): Promise<void> {
  const pluginsDir = config.plugins.dir;
  if (!existsSync(pluginsDir)) {
    return;
  }

  const dirs = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'sdk')
    .map((d) => d.name);

  for (const dir of dirs) {
    const manifestPath = join(pluginsDir, dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest: PluginManifest = await Bun.file(manifestPath).json();
    const sourceEntry = join(pluginsDir, dir, manifest.entry);
    const compiledEntry = join(pluginsDir, dir, 'dist', 'index.js');
    const entryPath = existsSync(sourceEntry) ? sourceEntry : compiledEntry;
    if (!existsSync(entryPath)) {
      continue;
    }

    try {
      const module = await import(pathToFileURL(entryPath).href);
      const pluginKey = Object.keys(module).find((k) => k.endsWith('Plugin'));
      const PluginClass = module.default ?? (pluginKey ? module[pluginKey] : undefined);
      if (!PluginClass || typeof PluginClass !== 'function') {
        continue;
      }

      const instance = new PluginClass(streamDeps);
      const capabilities = capabilitiesFromManifest(manifest);

      if (manifest.features.includes('device')) {
        const devicePlugin: DevicePlugin = {
          id: manifest.id,
          name: manifest.name,
          device: instance,
        };

        pluginRegistry.registerDevice(devicePlugin, manifest);
      } else {
        const plugin: SourcePlugin = {
          id: manifest.id,
          name: manifest.name,
          capabilities,
          search: manifest.features.includes('search') && typeof instance.search === 'function' ? instance : undefined,
          stream: manifest.features.includes('stream') && typeof instance.resolve === 'function' ? instance : undefined,
          import: manifest.features.includes('import') ? instance : undefined,
          download: typeof instance.downloadAlbumTracks === 'function' ? instance : undefined,
        };

        pluginRegistry.register(plugin, manifest);
        if (typeof instance.watch === 'function' && typeof instance.unwatch === 'function') {
          pluginRegistry.registerWatch(manifest.id, instance);
        }
      }
    } catch (error) {
      console.error(`[plugins] Failed to load plugin ${dir}:`, error);
    }
  }
}

async function deleteTrackAndCleanup(track: { id: string; album: string; artists: string[] }): Promise<void> {
  const { album: albumId, artists: artistIds } = track;

  await trackRepository.delete(track.id);

  if (albumId) {
    const remaining = await trackRepository.getOneBy(pbFilter('album = {:albumId}', { albumId }));
    if (!remaining) {
      await albumRepository.delete(albumId);
    }
  }

  for (const artistId of artistIds) {
    const remaining = await trackRepository.getOneBy(pbFilter('artists ~ {:artistId}', { artistId }));
    if (!remaining) {
      await artistRepository.delete(artistId);
    }
  }
}

async function handleWatchEvent(provider: TrackProvider, event: WatchEvent): Promise<void> {
  switch (event.type) {
    case 'sync': {
      const task = taskService.create('scan', 'Scanning local files');
      taskService.update(task.id, { status: 'running', progress: 0 });

      try {
        const diskUrls = new Set(event.tracks.map((t) => t.sourceUrl));
        taskService.update(task.id, { progress: 30 });

        const dbTracks = await trackRepository.getAllBy(pbFilter('provider = {:providerId}', { providerId: provider.id }));
        const dbUrls = dbTracks.map((t) => t.sourceUrl);
        taskService.update(task.id, { progress: 50 });

        const toAdd = event.tracks.filter((t) => !dbUrls.includes(t.sourceUrl));
        if (toAdd.length > 0) {
          logger.info(`[watch] Adding ${toAdd.length} new tracks`);
          const newTracks = await importPersistService.persistImportTracks(provider, toAdd);
          metadataEnrichmentService.enrichAfterImport(newTracks);
        }
        taskService.update(task.id, { progress: 75 });

        const toRemove = dbTracks.filter((t) => !diskUrls.has(t.sourceUrl));
        if (toRemove.length > 0) {
          logger.info(`[watch] Removing ${toRemove.length} orphaned tracks`);
          for (const track of toRemove) {
            await deleteTrackAndCleanup(track);
          }
        }

        logger.info('[watch] Sync completed');
        taskService.update(task.id, { status: 'completed', progress: 100 });
      } catch (error) {
        logger.error(`[watch] Sync failed: ${error}`);
        taskService.update(task.id, { status: 'failed' });
      }
      break;
    }

    case 'added': {
      try {
        const newTracks = await importPersistService.persistImportTracks(provider, event.tracks);
        metadataEnrichmentService.enrichAfterImport(newTracks);
      } catch (error) {
        logger.error(`[watch] Add failed: ${error}`);
      }
      break;
    }

    case 'removed': {
      try {
        for (const sourceUrl of event.sourceUrls) {
          const track = await trackRepository.getOneBy(pbFilter('sourceUrl = {:sourceUrl}', { sourceUrl }));
          if (track) {
            await deleteTrackAndCleanup(track);
          }
        }
      } catch (error) {
        logger.error(`[watch] Remove failed: ${error}`);
      }
      break;
    }
  }
}

export async function initializeWatchProviders(): Promise<void> {
  const activateWatch = async (pluginId: string) => {
    const watcher = pluginRegistry.getWatchProvider(pluginId);
    if (!watcher) {
      return;
    }
    const provider = (await providerRepository.getOneBy(pbFilter('type = {:pluginId} && enabled = true && category = "track"', { pluginId }))) as TrackProvider | null;
    if (provider) {
      watcher.watch(provider, (event) => {
        handleWatchEvent(provider, event).catch((err) => logger.error(`[watch] Event handler failed for ${pluginId}`, err));
      });
    }
  };

  const deactivateWatch = (pluginId: string) => {
    pluginRegistry.getWatchProvider(pluginId)?.unwatch();
  };

  const watchIds = [...pluginRegistry.getWatchProviderIds()];
  for (const id of watchIds) {
    await activateWatch(id);
  }

  pb.collection('providers').subscribe('*', async (e) => {
    const pluginId = e.record.type as string;
    if (!pluginRegistry.getWatchProvider(pluginId)) {
      return;
    }
    if (e.record.enabled) {
      await activateWatch(pluginId);
    } else {
      deactivateWatch(pluginId);
    }
  });
}
