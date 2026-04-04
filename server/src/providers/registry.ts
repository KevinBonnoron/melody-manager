import type { AlbumResolver, ArtistResolver, PlaylistResolver, PluginManifest, SearchType, TrackResolver } from '@melody-manager/shared';
import type { DownloadProvider, PluginCapabilities, SearchProvider, SourcePlugin, StreamResolver } from './types';

class ProviderRegistry {
  private readonly plugins = new Map<string, SourcePlugin>();
  private readonly searchProviders = new Map<string, SearchProvider>();
  private readonly streamResolvers = new Map<string, StreamResolver>();
  private readonly trackResolvers = new Map<string, TrackResolver>();
  private readonly albumResolvers = new Map<string, AlbumResolver>();
  private readonly artistResolvers = new Map<string, ArtistResolver>();
  private readonly playlistResolvers = new Map<string, PlaylistResolver>();
  private readonly downloadProviders = new Map<string, DownloadProvider>();
  private readonly manifests = new Map<string, PluginManifest>();

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

    if (plugin.trackResolver) {
      this.trackResolvers.set(plugin.id, plugin.trackResolver);
    }

    if (plugin.albumResolver) {
      this.albumResolvers.set(plugin.id, plugin.albumResolver);
    }

    if (plugin.artistResolver) {
      this.artistResolvers.set(plugin.id, plugin.artistResolver);
    }

    if (plugin.playlistResolver) {
      this.playlistResolvers.set(plugin.id, plugin.playlistResolver);
    }

    if (plugin.download) {
      this.downloadProviders.set(plugin.id, plugin.download);
    }
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

  public getTrackResolver(id: string): TrackResolver | undefined {
    return this.trackResolvers.get(id);
  }

  public getAlbumResolver(id: string): AlbumResolver | undefined {
    return this.albumResolvers.get(id);
  }

  public getArtistResolver(id: string): ArtistResolver | undefined {
    return this.artistResolvers.get(id);
  }

  public getPlaylistResolver(id: string): PlaylistResolver | undefined {
    return this.playlistResolvers.get(id);
  }

  public getDownloadProvider(id: string): DownloadProvider | undefined {
    return this.downloadProviders.get(id);
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

export const providerRegistry = new ProviderRegistry();
