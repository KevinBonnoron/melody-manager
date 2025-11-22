import type { SearchResult, SearchType, Track, TrackProvider, TrackProviderType } from '@melody-manager/shared';
import { pluginRegistry } from '../plugins';
import { providerRepository } from '../repositories';
import { bandcampSource, localSource, soundCloudSource, spotifySource, youtubeSource } from '../sources';
import type { TrackSource } from '../types';
import { persistImportTracks } from './import-persist.service';

const trackSources: Record<TrackProviderType, TrackSource> = {
  local: localSource,
  youtube: youtubeSource,
  spotify: spotifySource,
  soundcloud: soundCloudSource,
  bandcamp: bandcampSource,
};

class SourceService {
  async addFromUrl(url: string): Promise<Track[]> {
    const providerType = this.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const provider = (await providerRepository.getOneBy(`type = "${providerType}" && enabled = true && category = "track"`)) as TrackProvider;
    if (!provider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (importPlugin) {
      const importTracks = await importPlugin.getTracks(url, provider);
      return await persistImportTracks(provider, importTracks);
    }

    const trackSource = trackSources[providerType];
    if (!trackSource) {
      throw new Error(`Track source for ${providerType} not found`);
    }
    return await trackSource.getTracks(url, provider);
  }

  async search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]> {
    const searchPlugin = pluginRegistry.getSearchProvider(provider.type);
    if (searchPlugin) {
      if (pluginRegistry.supportsSearchType(provider.type, type)) {
        return await searchPlugin.search(query, type, provider);
      }
      return [];
    }

    const trackSource = trackSources[provider.type];
    if (!trackSource) return [];

    switch (type) {
      case 'track':
        return await trackSource.searchTracks(query, provider);
      case 'album':
        return trackSource.searchAlbums ? await trackSource.searchAlbums(query, provider) : [];
      case 'artist':
        return trackSource.searchArtists ? await trackSource.searchArtists(query, provider) : [];
      case 'playlist':
        return trackSource.searchPlaylists ? await trackSource.searchPlaylists(query, provider) : [];
      default:
        return [];
    }
  }

  async addAlbumFromUrl(url: string): Promise<Track[]> {
    const providerType = this.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const provider = (await providerRepository.getOneBy(`type = "${providerType}" && enabled = true && category = "track"`)) as TrackProvider;
    if (!provider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (importPlugin?.getAlbumTracks) {
      const importTracks = await importPlugin.getAlbumTracks(url, provider);
      return await persistImportTracks(provider, importTracks);
    }
    const trackSource = trackSources[providerType];
    if (!trackSource?.getAlbumTracks) {
      throw new Error(`Provider ${providerType} does not support album import`);
    }
    return await trackSource.getAlbumTracks(url, provider);
  }

  async addArtistFromUrl(url: string): Promise<Track[]> {
    const providerType = this.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const provider = (await providerRepository.getOneBy(`type = "${providerType}" && enabled = true && category = "track"`)) as TrackProvider;
    if (!provider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (importPlugin?.getArtistTracks) {
      const importTracks = await importPlugin.getArtistTracks(url, provider);
      return await persistImportTracks(provider, importTracks);
    }
    const trackSource = trackSources[providerType];
    if (!trackSource?.getArtistTracks) {
      throw new Error(`Provider ${providerType} does not support artist import`);
    }
    return await trackSource.getArtistTracks(url, provider);
  }

  async addPlaylistFromUrl(url: string): Promise<Track[]> {
    const providerType = this.detectProviderFromUrl(url);
    if (!providerType) {
      throw new Error('Could not detect provider from URL');
    }

    const provider = (await providerRepository.getOneBy(`type = "${providerType}" && enabled = true && category = "track"`)) as TrackProvider;
    if (!provider) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    const importPlugin = pluginRegistry.getImportProvider(providerType);
    if (importPlugin?.getPlaylistTracks) {
      const importTracks = await importPlugin.getPlaylistTracks(url, provider);
      return await persistImportTracks(provider, importTracks);
    }
    const trackSource = trackSources[providerType];
    if (!trackSource?.getPlaylistTracks) {
      throw new Error(`Provider ${providerType} does not support playlist import`);
    }
    return await trackSource.getPlaylistTracks(url, provider);
  }

  private detectProviderFromUrl(url: string): TrackProviderType | null {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be') || urlLower.startsWith('youtube:')) {
      return 'youtube';
    }
    if (urlLower.includes('soundcloud.com') || urlLower.startsWith('soundcloud:')) {
      return 'soundcloud';
    }
    if (urlLower.includes('spotify.com') || urlLower.startsWith('spotify:')) {
      return 'spotify';
    }
    if (urlLower.includes('bandcamp.com') || urlLower.startsWith('bandcamp:')) {
      return 'bandcamp';
    }
    if (urlLower.startsWith('file://') || urlLower.startsWith('/')) {
      return 'local';
    }
    return null;
  }
}

export const trackSourceService = new SourceService();
