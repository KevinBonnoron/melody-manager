import type { SearchResult, SearchType, Task, Track, TrackProvider } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { providerRegistry } from '../providers';
import { connectionRepository, providerRepository } from '../repositories';
import { importPersistService } from './import-persist.service';
import { libraryService } from './library.service';
import { taskService } from './task.service';

class SourceService {
  public async addFromUrl(url: string, userId?: string | null): Promise<Task> {
    const provider = await this.resolveProvider(url, userId);
    const resolver = providerRegistry.getTrackResolver(provider.type);
    if (!resolver) {
      throw new Error(`Provider ${provider.type} does not support track resolution`);
    }

    return this.runImportTask(
      `Import track from ${provider.type}`,
      async () => {
        const resolved = await resolver.resolveTracks(url, provider);
        return importPersistService.persistTracks(provider, resolved);
      },
      userId,
    );
  }

  public async addAlbumFromUrl(url: string, userId?: string | null): Promise<Task> {
    const provider = await this.resolveProvider(url, userId);
    const resolver = providerRegistry.getAlbumResolver(provider.type);
    if (!resolver) {
      throw new Error(`Provider ${provider.type} does not support album resolution`);
    }

    return this.runImportTask(
      `Import album from ${provider.type}`,
      async () => {
        const resolved = await resolver.resolveAlbum(url, provider);
        return importPersistService.persistAlbum(provider, resolved);
      },
      userId,
    );
  }

  public async addArtistFromUrl(url: string, userId?: string | null): Promise<Task> {
    const provider = await this.resolveProvider(url, userId);
    const resolver = providerRegistry.getArtistResolver(provider.type);
    if (!resolver) {
      throw new Error(`Provider ${provider.type} does not support artist resolution`);
    }

    return this.runImportTask(
      `Import artist from ${provider.type}`,
      async () => {
        const resolved = await resolver.resolveArtist(url, provider);
        return importPersistService.persistArtist(provider, resolved);
      },
      userId,
    );
  }

  public async addPlaylistFromUrl(url: string, userId?: string | null): Promise<Task> {
    const provider = await this.resolveProvider(url, userId);
    const resolver = providerRegistry.getPlaylistResolver(provider.type);
    if (!resolver) {
      throw new Error(`Provider ${provider.type} does not support playlist resolution`);
    }

    return this.runImportTask(
      `Import playlist from ${provider.type}`,
      async () => {
        const resolved = await resolver.resolvePlaylist(url, provider);
        return importPersistService.persistPlaylist(provider, resolved);
      },
      userId,
    );
  }

  public async search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]> {
    const searchPlugin = providerRegistry.getSearchProvider(provider.type);
    if (!searchPlugin) {
      return [];
    }

    if (!providerRegistry.supportsSearchType(provider.type, type)) {
      return [];
    }

    return await searchPlugin.search(query, type, provider);
  }

  private async resolveProvider(url: string, userId?: string | null): Promise<TrackProvider> {
    const providerType = providerRegistry.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const manifest = providerRegistry.getManifest(providerType);
    if (!manifest) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }

    const systemProvider = await providerRepository.getOneBy(pbFilter('type = {:providerType} && enabled = true && category = "track"', { providerType }));
    if (!systemProvider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    if (manifest.scope === 'personal') {
      if (!userId) {
        throw new Error(`Provider ${providerType} requires authentication`);
      }

      const connection = await connectionRepository.getOneBy(pbFilter('provider = {:providerId} && user = {:userId}', { providerId: systemProvider.id, userId }));
      if (connection && !connection.enabled) {
        throw new Error(`Provider ${providerType} is disconnected for this user`);
      }

      return {
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
    }

    return systemProvider as TrackProvider;
  }

  private runImportTask(name: string, persist: () => Promise<Track[]>, userId?: string | null): Task {
    const task = taskService.create('import', name);
    taskService.update(task.id, { status: 'running', progress: 0 });

    (async () => {
      try {
        taskService.update(task.id, { progress: 50 });
        const tracks = await persist();

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
