import type { TrackProvider } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pb, pbFilter } from '../lib/pocketbase';
import { albumRepository, artistRepository, providerRepository, trackRepository } from '../repositories';
import { importPersistService, metadataEnrichmentService, taskService } from '../services';
import { BandcampProvider } from './bandcamp/bandcamp.provider';
import { bandcampManifest } from './bandcamp/manifest';
import { deviceRegistry } from './device.registry';
import { LocalProvider } from './local/local.provider';
import { localManifest } from './local/manifest';
import { providerRegistry } from './registry';
import { sonosManifest } from './sonos/manifest';
import { SonosProvider } from './sonos/sonos.provider';
import { soundcloudManifest } from './soundcloud/manifest';
import { SoundcloudProvider } from './soundcloud/soundcloud.provider';
import { spotifyManifest } from './spotify/manifest';
import { SpotifyProvider } from './spotify/spotify.provider';
import type { PluginCapabilities, WatchEvent } from './types';
import { watchRegistry } from './watch.registry';
import { youtubeManifest } from './youtube/manifest';
import { YoutubeProvider } from './youtube/youtube.provider';

export type { ConfigSchemaItem, PluginManifest } from '@melody-manager/shared';
export { deviceRegistry } from './device.registry';
export { providerRegistry } from './registry';
export type { DownloadProvider, PluginCapabilities, SearchProvider, SourcePlugin } from './types';
export { watchRegistry } from './watch.registry';

function capabilitiesFromManifest(manifest: { features: string[]; searchTypes?: string[]; importTypes?: string[] }): PluginCapabilities {
  return {
    search: manifest.features.includes('search') ? (manifest.searchTypes as PluginCapabilities['search']) : undefined,
    stream: manifest.features.includes('stream') ? true : undefined,
    import: manifest.features.includes('import') ? (manifest.importTypes as PluginCapabilities['import']) : undefined,
  };
}

export function registerAllProviders(): void {
  const youtube = new YoutubeProvider();
  providerRegistry.register({ id: 'youtube', name: 'YouTube', capabilities: capabilitiesFromManifest(youtubeManifest), search: youtube, stream: youtube, trackResolver: youtube, albumResolver: youtube, artistResolver: youtube, playlistResolver: youtube, download: youtube }, youtubeManifest);

  const soundcloud = new SoundcloudProvider();
  providerRegistry.register({ id: 'soundcloud', name: 'SoundCloud', capabilities: capabilitiesFromManifest(soundcloudManifest), search: soundcloud, stream: soundcloud, trackResolver: soundcloud }, soundcloudManifest);

  const bandcamp = new BandcampProvider();
  providerRegistry.register({ id: 'bandcamp', name: 'Bandcamp', capabilities: capabilitiesFromManifest(bandcampManifest), stream: bandcamp, trackResolver: bandcamp, albumResolver: bandcamp, artistResolver: bandcamp }, bandcampManifest);

  const spotify = new SpotifyProvider();
  providerRegistry.register({ id: 'spotify', name: 'Spotify', capabilities: capabilitiesFromManifest(spotifyManifest), search: spotify, trackResolver: spotify }, spotifyManifest);

  const local = new LocalProvider();
  providerRegistry.register({ id: 'local', name: 'Local Files', capabilities: capabilitiesFromManifest(localManifest), stream: local, trackResolver: local }, localManifest);
  watchRegistry.register('local', local);

  const sonos = new SonosProvider();
  deviceRegistry.register({ id: 'sonos', name: 'Sonos', device: sonos }, sonosManifest);

  logger.info(`[providers] Registered ${providerRegistry.getRegisteredIds().length} source providers + sonos device`);
}

// Watch provider logic (for local files)

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
          const newTracks = await importPersistService.persistTracks(provider, toAdd);
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
        const newTracks = await importPersistService.persistTracks(provider, event.tracks);
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
    const watcher = watchRegistry.get(pluginId);
    if (!watcher) {
      return;
    }

    const provider = (await providerRepository.getOneBy(pbFilter('type = {:pluginId} && enabled = true && category = "track"', { pluginId }))) as TrackProvider | null;
    if (provider) {
      watcher.watch(provider, (event) => {
        handleWatchEvent(provider, event).catch((err) => logger.error(`[watch] Event handler failed for ${pluginId}: ${err}`));
      });
    }
  };

  const deactivateWatch = (pluginId: string) => {
    watchRegistry.get(pluginId)?.unwatch();
  };

  const watchIds = [...watchRegistry.getIds()];
  for (const id of watchIds) {
    await activateWatch(id);
  }

  pb.collection('providers').subscribe('*', async (e) => {
    const pluginId = e.record.type as string;
    if (!watchRegistry.get(pluginId)) {
      return;
    }

    if (e.record.enabled) {
      await activateWatch(pluginId);
    } else {
      deactivateWatch(pluginId);
    }
  });
}
