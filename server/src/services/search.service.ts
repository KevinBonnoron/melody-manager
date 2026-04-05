import type { AlbumSearchResult, ArtistSearchResult, LibraryStatus, PlaylistSearchResult, ProviderError, SearchResponse, SearchResult, SearchType, TrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { providerRegistry } from '../providers';
import { albumRepository, artistRepository, connectionRepository, playlistRepository, providerRepository, trackRepository } from '../repositories';
import { ProviderAuthError } from '../utils';
import { trackSourceService } from './track-source.service';

class SearchService {
  public async search(query: string, type: SearchType, userId?: string | null): Promise<SearchResponse> {
    const providers = await this.getProvidersForQuery(query, userId);
    const providerErrors: ProviderError[] = [];
    const providerResults = await Promise.all(
      providers.map(async (provider) => {
        try {
          return await trackSourceService.search(query, type, provider);
        } catch (error) {
          if (error instanceof ProviderAuthError) {
            providerErrors.push({ provider: provider.type, code: error.code });
            return [];
          }
          logger.error(`Error searching with provider ${provider.type}: ${error}`);
          return [];
        }
      }),
    );
    const results = await this.enrichWithLibraryStatus(providerResults.flat(), type);
    return { results, providerErrors };
  }

  private async getProvidersForQuery(query: string, userId?: string | null): Promise<TrackProvider[]> {
    const detectedProviderType = providerRegistry.detectProviderFromUrl(query);

    const providers = await this.getEffectiveProviders(userId);

    if (detectedProviderType) {
      return providers.filter((p) => p.type === detectedProviderType);
    }
    return providers;
  }

  public async getEffectiveProviders(userId?: string | null): Promise<TrackProvider[]> {
    const results: TrackProvider[] = [];
    const allProviders = (await providerRepository.getAllBy('category = "track" && enabled = true')) as TrackProvider[];

    // Load all user connections in one query and index by provider id
    const connectionsByProvider = new Map(userId ? (await connectionRepository.getAllBy(pbFilter('user = {:userId}', { userId }))).map((c) => [c.provider, c]) : []);

    for (const provider of allProviders) {
      const manifest = providerRegistry.getManifest(provider.type);
      if (!manifest) {
        continue;
      }

      if (manifest.scope === 'shared' || manifest.scope === 'public') {
        results.push(provider);
      } else if (manifest.scope === 'personal' && userId) {
        const connection = connectionsByProvider.get(provider.id);
        if (connection && !connection.enabled) {
          continue;
        }
        results.push({
          id: provider.id,
          collectionId: provider.collectionId,
          collectionName: provider.collectionName,
          created: provider.created,
          updated: provider.updated,
          type: provider.type,
          category: 'track',
          config: connection ? { ...provider.config, ...connection.config } : provider.config,
          enabled: connection?.enabled ?? true,
        });
      }
    }

    return results;
  }

  private async enrichWithLibraryStatus(results: SearchResult[], type: SearchType): Promise<SearchResult[]> {
    if (type === 'track') {
      const existingTracks = await trackRepository.getAllBy();
      const existingUrls = new Set(existingTracks.map((t) => t.sourceUrl));
      return (results as TrackSearchResult[]).map((r) => ({
        ...r,
        libraryStatus: { isInLibrary: existingUrls.has(r.externalUrl) },
      }));
    }
    if (type === 'album') {
      return Promise.all((results as AlbumSearchResult[]).map((r) => this.addAlbumLibraryStatus(r)));
    }
    if (type === 'artist') {
      return Promise.all((results as ArtistSearchResult[]).map((r) => this.addArtistLibraryStatus(r)));
    }
    if (type === 'playlist') {
      return Promise.all((results as PlaylistSearchResult[]).map((r) => this.addPlaylistLibraryStatus(r)));
    }

    return results.map((r) => ({
      ...r,
      libraryStatus: { isInLibrary: false },
    }));
  }

  private async addAlbumLibraryStatus(result: AlbumSearchResult): Promise<AlbumSearchResult> {
    try {
      const album = await albumRepository.getOneBy(pbFilter('name = {:name}', { name: result.name }));
      if (!album) {
        return {
          ...result,
          libraryStatus: {
            isInLibrary: false,
            tracksInLibrary: 0,
            totalTracks: result.trackCount,
          },
        };
      }
      const tracks = await trackRepository.getAllBy(pbFilter('album = {:albumId}', { albumId: album.id }));
      const libraryStatus: LibraryStatus = {
        isInLibrary: result.trackCount ? tracks.length >= result.trackCount : tracks.length > 0,
        tracksInLibrary: tracks.length,
        totalTracks: result.trackCount || tracks.length,
      };
      return { ...result, libraryStatus };
    } catch {
      return {
        ...result,
        libraryStatus: {
          isInLibrary: false,
          tracksInLibrary: 0,
          totalTracks: result.trackCount,
        },
      };
    }
  }

  private async addArtistLibraryStatus(result: ArtistSearchResult): Promise<ArtistSearchResult> {
    try {
      const artist = await artistRepository.getOneBy(pbFilter('name = {:name}', { name: result.name }));
      if (!artist) {
        return {
          ...result,
          libraryStatus: {
            isInLibrary: false,
            tracksInLibrary: 0,
            totalTracks: result.trackCount,
          },
        };
      }
      const tracks = await trackRepository.getAllBy(pbFilter('artists ?= {:artistId}', { artistId: artist.id }));
      const libraryStatus: LibraryStatus = {
        isInLibrary: false,
        tracksInLibrary: tracks.length,
        totalTracks: result.trackCount || tracks.length,
      };
      return { ...result, libraryStatus };
    } catch {
      return {
        ...result,
        libraryStatus: {
          isInLibrary: false,
          tracksInLibrary: 0,
          totalTracks: result.trackCount,
        },
      };
    }
  }

  private async addPlaylistLibraryStatus(result: PlaylistSearchResult): Promise<PlaylistSearchResult> {
    try {
      if (!result.externalUrl) {
        return {
          ...result,
          libraryStatus: {
            isInLibrary: false,
            tracksInLibrary: 0,
            totalTracks: result.trackCount,
          },
        };
      }

      const playlist = await playlistRepository.getOneBy(pbFilter('sourceUrl = {:sourceUrl}', { sourceUrl: result.externalUrl }));
      if (!playlist) {
        return {
          ...result,
          libraryStatus: {
            isInLibrary: false,
            tracksInLibrary: 0,
            totalTracks: result.trackCount,
          },
        };
      }

      const libraryStatus: LibraryStatus = {
        isInLibrary: result.trackCount ? playlist.tracks.length >= result.trackCount : playlist.tracks.length > 0,
        tracksInLibrary: playlist.tracks.length,
        totalTracks: result.trackCount || playlist.tracks.length,
      };

      return { ...result, libraryStatus };
    } catch {
      return {
        ...result,
        libraryStatus: {
          isInLibrary: false,
          tracksInLibrary: 0,
          totalTracks: result.trackCount,
        },
      };
    }
  }

  public async searchLibrary(query: string): Promise<{ tracks: unknown[]; albums: unknown[]; artists: unknown[] }> {
    const normalizedQuery = query.toLowerCase().trim();
    const [tracks, albums, artists] = await Promise.all([trackRepository.getAllBy(pbFilter('title ~ {:query}', { query: normalizedQuery })), albumRepository.getAllBy(pbFilter('name ~ {:query}', { query: normalizedQuery })), artistRepository.getAllBy(pbFilter('name ~ {:query}', { query: normalizedQuery }))]);
    return { tracks, albums, artists };
  }
}

export const searchService = new SearchService();
