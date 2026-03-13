import type { PluginManifest } from '@melody-manager/plugin-sdk';
import type { SearchType } from '@melody-manager/shared';
import type { DevicePlugin, DeviceProvider, DownloadProvider, ImportProvider, PluginCapabilities, SearchProvider, SourcePlugin, StreamResolver, WatchProvider } from './types';

class PluginRegistry {
  private readonly plugins = new Map<string, SourcePlugin>();
  private readonly searchProviders = new Map<string, SearchProvider>();
  private readonly streamResolvers = new Map<string, StreamResolver>();
  private readonly importProviders = new Map<string, ImportProvider>();
  private readonly downloadProviders = new Map<string, DownloadProvider>();
  private readonly devicePlugins = new Map<string, DevicePlugin>();
  private readonly watchProviders = new Map<string, WatchProvider>();
  private readonly manifests = new Map<string, PluginManifest>();
  private cacheInvalidator?: (key: string) => void;

  public setCacheInvalidator(fn: (key: string) => void): void {
    this.cacheInvalidator = fn;
  }

  public invalidateCache(key: string): void {
    this.cacheInvalidator?.(key);
  }

  public register(plugin: SourcePlugin, manifest: PluginManifest): void {
    if (this.plugins.has(plugin.id)) {
      return;
    }
    this.plugins.set(plugin.id, plugin);
    this.manifests.set(plugin.id, manifest);
    if (plugin.search) {
      this.searchProviders.set(plugin.id, plugin.search);
    }
    if (plugin.stream) {
      this.streamResolvers.set(plugin.id, plugin.stream);
    }
    if (plugin.import) {
      this.importProviders.set(plugin.id, plugin.import);
    }
    if (plugin.download) {
      this.downloadProviders.set(plugin.id, plugin.download);
    }
  }

  public registerDevice(plugin: DevicePlugin, manifest: PluginManifest): void {
    if (this.devicePlugins.has(plugin.id)) {
      return;
    }
    this.devicePlugins.set(plugin.id, plugin);
    this.manifests.set(plugin.id, manifest);
  }

  public getCapabilities(id: string): PluginCapabilities | undefined {
    return this.plugins.get(id)?.capabilities;
  }

  public supportsSearchType(id: string, type: SearchType): boolean {
    const cap = this.getCapabilities(id);
    if (!cap?.search) {
      return false;
    }
    return cap.search.includes(type);
  }

  public getSearchProvider(id: string): SearchProvider | undefined {
    return this.searchProviders.get(id);
  }

  public getStreamResolver(id: string): StreamResolver | undefined {
    return this.streamResolvers.get(id);
  }

  public getImportProvider(id: string): ImportProvider | undefined {
    return this.importProviders.get(id);
  }

  public getDownloadProvider(id: string): DownloadProvider | undefined {
    return this.downloadProviders.get(id);
  }

  public getDeviceProvider(id: string): DeviceProvider | undefined {
    return this.devicePlugins.get(id)?.device;
  }

  public getPlugin(id: string): SourcePlugin | undefined {
    return this.plugins.get(id);
  }

  public getRegisteredIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  public getManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  public getManifest(id: string): PluginManifest | undefined {
    return this.manifests.get(id);
  }

  public registerWatch(id: string, watcher: WatchProvider): void {
    this.watchProviders.set(id, watcher);
  }

  public getWatchProvider(id: string): WatchProvider | undefined {
    return this.watchProviders.get(id);
  }

  public getWatchProviderIds(): string[] {
    return Array.from(this.watchProviders.keys());
  }

  public detectProviderFromUrl(url: string): string | null {
    const urlLower = url.toLowerCase();
    for (const [id, manifest] of this.manifests) {
      if (manifest.urlPatterns?.some((pattern) => urlLower.includes(pattern.toLowerCase()))) {
        return id;
      }
    }
    return null;
  }
}

export const pluginRegistry = new PluginRegistry();
