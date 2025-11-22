import type { AlbumSearchResult, ArtistSearchResult, LibraryStatus, SearchResult, SearchType, TrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { logger } from '../lib/logger';
import { albumRepository, artistRepository, providerRepository, trackRepository } from '../repositories';
import { detectProviderFromUrl } from '../utils';
import { trackSourceService } from './track-source.service';

class SearchService {
  async search(query: string, type: SearchType): Promise<SearchResult[]> {
    const providers = await this.getProvidersForQuery(query);
    const providerResults = await Promise.all(
      providers.map(async (provider) => {
        try {
          return await trackSourceService.search(query, type, provider);
        } catch (error) {
          logger.error(`Error searching with provider ${provider.type}: ${error}`);
          return [];
        }
      }),
    );
    const results = providerResults.flat();
    return this.enrichWithLibraryStatus(results, type);
  }

  private async getProvidersForQuery(query: string): Promise<TrackProvider[]> {
    const allProviders = (await providerRepository.getAllBy('category = "track" && enabled = true')) as TrackProvider[];
    const detectedProviderType = detectProviderFromUrl(query);
    if (detectedProviderType) {
      return allProviders.filter((p) => p.type === detectedProviderType);
    }
    return allProviders;
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
    return results.map((r) => ({
      ...r,
      libraryStatus: { isInLibrary: false },
    }));
  }

  private async addAlbumLibraryStatus(result: AlbumSearchResult): Promise<AlbumSearchResult> {
    try {
      const album = await albumRepository.getOneBy(`name = "${result.name}"`);
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
      const tracks = await trackRepository.getAllBy(`album = "${album.id}"`);
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
      const artist = await artistRepository.getOneBy(`name = "${result.name}"`);
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
      const tracks = await trackRepository.getAllBy(`artists ~ "${artist.id}"`);
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

  async searchLibrary(query: string): Promise<{ tracks: any[]; albums: any[]; artists: any[] }> {
    const normalizedQuery = query.toLowerCase().trim();
    const [tracks, albums, artists] = await Promise.all([trackRepository.getAllBy(`title ~ "${normalizedQuery}"`), albumRepository.getAllBy(`name ~ "${normalizedQuery}"`), artistRepository.getAllBy(`name ~ "${normalizedQuery}"`)]);
    return { tracks, albums, artists };
  }
}

export const searchService = new SearchService();
