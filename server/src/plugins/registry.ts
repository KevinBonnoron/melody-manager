import type { SearchType, TrackProviderType } from '@melody-manager/shared';
import type { ImportProvider, MelodyPlugin, PluginCapabilities, SearchProvider, StreamProvider } from './types';

class PluginRegistry {
  private plugins = new Map<TrackProviderType, MelodyPlugin>();
  private searchProviders = new Map<TrackProviderType, SearchProvider>();
  private streamProviders = new Map<TrackProviderType, StreamProvider>();
  private importProviders = new Map<TrackProviderType, ImportProvider>();

  register(plugin: MelodyPlugin): void {
    if (this.plugins.has(plugin.id)) {
      return;
    }
    this.plugins.set(plugin.id, plugin);
    if (plugin.search) {
      this.searchProviders.set(plugin.id, plugin.search);
    }
    if (plugin.stream) {
      this.streamProviders.set(plugin.id, plugin.stream);
    }
    if (plugin.import) {
      this.importProviders.set(plugin.id, plugin.import);
    }
  }

  getCapabilities(id: TrackProviderType): PluginCapabilities | undefined {
    return this.plugins.get(id)?.capabilities;
  }

  supportsSearchType(id: TrackProviderType, type: SearchType): boolean {
    const cap = this.getCapabilities(id);
    if (!cap) return true;
    if (!cap.search) return true;
    return cap.search.includes(type);
  }

  getSearchProvider(id: TrackProviderType): SearchProvider | undefined {
    return this.searchProviders.get(id);
  }

  getStreamProvider(id: TrackProviderType): StreamProvider | undefined {
    return this.streamProviders.get(id);
  }

  getImportProvider(id: TrackProviderType): ImportProvider | undefined {
    return this.importProviders.get(id);
  }

  getPlugin(id: TrackProviderType): MelodyPlugin | undefined {
    return this.plugins.get(id);
  }

  getRegisteredIds(): TrackProviderType[] {
    return Array.from(this.plugins.keys());
  }
}

export const pluginRegistry = new PluginRegistry();
