import type { ImportProvider, PluginImportTrack } from '@melody-manager/plugin-sdk';
import type { SearchResult, SearchType, Task, TrackProvider } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { pluginRegistry } from '../plugins';
import { connectionRepository, providerRepository } from '../repositories';
import { importPersistService } from './import-persist.service';
import { libraryService } from './library.service';
import { taskService } from './task.service';

class SourceService {
  public async addFromUrl(url: string, userId?: string | null): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url, userId);
    return this.runImportTask(`Import track from ${provider.type}`, provider, () => importPlugin.getTracks(url, provider), userId);
  }

  public async addAlbumFromUrl(url: string, userId?: string | null): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url, userId);
    const getAlbumTracks = importPlugin.getAlbumTracks?.bind(importPlugin);
    if (!getAlbumTracks) {
      throw new Error(`Provider ${provider.type} does not support album import`);
    }
    return this.runImportTask(`Import album from ${provider.type}`, provider, () => getAlbumTracks(url, provider), userId);
  }

  public async addArtistFromUrl(url: string, userId?: string | null): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url, userId);
    const getArtistTracks = importPlugin.getArtistTracks?.bind(importPlugin);
    if (!getArtistTracks) {
      throw new Error(`Provider ${provider.type} does not support artist import`);
    }
    return this.runImportTask(`Import artist from ${provider.type}`, provider, () => getArtistTracks(url, provider), userId);
  }

  public async addPlaylistFromUrl(url: string, userId?: string | null): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url, userId);
    const getPlaylistTracks = importPlugin.getPlaylistTracks?.bind(importPlugin);
    if (!getPlaylistTracks) {
      throw new Error(`Provider ${provider.type} does not support playlist import`);
    }
    return this.runImportTask(`Import playlist from ${provider.type}`, provider, () => getPlaylistTracks(url, provider), userId);
  }

  public async search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]> {
    const searchPlugin = pluginRegistry.getSearchProvider(provider.type);
    if (!searchPlugin) {
      return [];
    }

    if (!pluginRegistry.supportsSearchType(provider.type, type)) {
      return [];
    }

    return await searchPlugin.search(query, type, provider);
  }

  private async resolveImport(url: string, userId?: string | null): Promise<{ provider: TrackProvider; importPlugin: ImportProvider }> {
    const providerType = pluginRegistry.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const manifest = pluginRegistry.getManifest(providerType);
    if (!manifest) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }
    const systemProvider = await providerRepository.getOneBy(pbFilter('type = {:providerType} && enabled = true && category = "track"', { providerType }));
    if (!systemProvider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    let effectiveProvider: TrackProvider;

    if (manifest.scope === 'personal') {
      if (!userId) {
        throw new Error(`Provider ${providerType} requires authentication`);
      }
      // Connection is optional: merge if present, fallback to provider config alone
      // Query without enabled filter so a disabled connection is distinguishable from no connection
      const connection = await connectionRepository.getOneBy(pbFilter('provider = {:providerId} && user = {:userId}', { providerId: systemProvider.id, userId }));
      if (connection && !connection.enabled) {
        throw new Error(`Provider ${providerType} is disconnected for this user`);
      }
      effectiveProvider = {
        id: systemProvider.id,
        collectionId: systemProvider.collectionId,
        collectionName: systemProvider.collectionName,
        created: systemProvider.created,
        updated: systemProvider.updated,
        type: systemProvider.type,
        category: 'track',
        config: connection ? { ...systemProvider.config, ...connection.config } : systemProvider.config,
        enabled: connection?.enabled ?? true,
      };
    } else {
      effectiveProvider = systemProvider as TrackProvider;
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (!importPlugin) {
      throw new Error(`No import plugin found for ${providerType}`);
    }

    return { provider: effectiveProvider, importPlugin };
  }

  private runImportTask(name: string, provider: TrackProvider, fetchTracks: () => Promise<PluginImportTrack[]>, userId?: string | null): Task {
    const task = taskService.create('import', name);
    taskService.update(task.id, { status: 'running', progress: 0 });

    (async () => {
      try {
        const importTracks = await fetchTracks();
        taskService.update(task.id, { progress: 50 });
        const tracks = await importPersistService.persistImportTracks(provider, importTracks);
        if (userId) {
          await libraryService.autoLikeFromTracks(userId, tracks);
        }
        taskService.update(task.id, { status: 'completed', progress: 100 });
      } catch (error) {
        logger.error(`Import task failed: ${error}`);
        taskService.update(task.id, { status: 'failed' });
      }
    })();

    return task;
  }
}

export const trackSourceService = new SourceService();
