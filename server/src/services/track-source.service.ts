import type { ImportProvider, PluginImportTrack } from '@melody-manager/plugin-sdk';
import type { SearchResult, SearchType, Task, TrackProvider } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pluginRegistry } from '../plugins';
import { providerRepository } from '../repositories';
import { importPersistService } from './import-persist.service';
import { taskService } from './task.service';

class SourceService {
  public async addFromUrl(url: string): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url);
    return this.runImportTask(`Import track from ${provider.type}`, provider, () => importPlugin.getTracks(url, provider));
  }

  public async addAlbumFromUrl(url: string): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url);
    const getAlbumTracks = importPlugin.getAlbumTracks?.bind(importPlugin);
    if (!getAlbumTracks) {
      throw new Error(`Provider ${provider.type} does not support album import`);
    }
    return this.runImportTask(`Import album from ${provider.type}`, provider, () => getAlbumTracks(url, provider));
  }

  public async addArtistFromUrl(url: string): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url);
    const getArtistTracks = importPlugin.getArtistTracks?.bind(importPlugin);
    if (!getArtistTracks) {
      throw new Error(`Provider ${provider.type} does not support artist import`);
    }
    return this.runImportTask(`Import artist from ${provider.type}`, provider, () => getArtistTracks(url, provider));
  }

  public async addPlaylistFromUrl(url: string): Promise<Task> {
    const { provider, importPlugin } = await this.resolveImport(url);
    const getPlaylistTracks = importPlugin.getPlaylistTracks?.bind(importPlugin);
    if (!getPlaylistTracks) {
      throw new Error(`Provider ${provider.type} does not support playlist import`);
    }
    return this.runImportTask(`Import playlist from ${provider.type}`, provider, () => getPlaylistTracks(url, provider));
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

  private async resolveImport(url: string): Promise<{ provider: TrackProvider; importPlugin: ImportProvider }> {
    const providerType = pluginRegistry.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const provider = (await providerRepository.getOneBy(`type = "${providerType}" && enabled = true && category = "track"`)) as TrackProvider;
    if (!provider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (!importPlugin) {
      throw new Error(`No import plugin found for ${providerType}`);
    }

    return { provider, importPlugin };
  }

  private runImportTask(name: string, provider: TrackProvider, fetchTracks: () => Promise<PluginImportTrack[]>): Task {
    const task = taskService.create('import', name);
    taskService.update(task.id, { status: 'running', progress: 0 });

    (async () => {
      try {
        const importTracks = await fetchTracks();
        taskService.update(task.id, { progress: 50 });
        await importPersistService.persistImportTracks(provider, importTracks);
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
