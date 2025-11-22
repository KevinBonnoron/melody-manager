import type { ImportProvider, PluginImportTrack, PluginStreamDeps, SearchProvider, StreamOptions } from '@melody-manager/plugin-sdk';
import type { SearchResult, SearchType, SoundcloudTrackProvider, TrackSearchResult } from '@melody-manager/shared';
import type { Context } from 'hono';
import { handleSoundCloudStream } from './stream';

export class SoundcloudPlugin implements SearchProvider, ImportProvider {
  constructor(private readonly deps: PluginStreamDeps) {}

  get ytDlpService() {
    return this.deps.ytDlpService;
  }

  async search(query: string, type: SearchType, _provider: SoundcloudTrackProvider): Promise<SearchResult[]> {
    if (type !== 'track') return [];
    return this.searchTracks(query);
  }

  async stream(c: Context, options: StreamOptions): Promise<Response> {
    return handleSoundCloudStream(c, options, this.deps);
  }

  private async searchTracks(query: string): Promise<TrackSearchResult[]> {
    try {
      const results = await this.ytDlpService.searchSoundCloud(query, 20);
      return results.map((info) => ({
        type: 'track' as const,
        provider: 'soundcloud' as const,
        title: info.title ?? 'Unknown Title',
        artist: info.artist ?? info.uploader,
        album: info.album,
        thumbnail: info.thumbnail,
        externalUrl: info.webpage_url,
        duration: info.duration ? Math.floor(info.duration) : undefined,
      }));
    } catch (error) {
      console.error(`Error searching SoundCloud: ${error}`);
      return [];
    }
  }

  async getTracks(url: string, _provider: SoundcloudTrackProvider): Promise<PluginImportTrack[]> {
    try {
      const trackInfo = await this.ytDlpService.extractTrackInfo(url);
      if (!trackInfo) throw new Error('Failed to extract track info from SoundCloud URL');

      const artistName = trackInfo.artist ?? trackInfo.uploader ?? 'Unknown Artist';
      const albumName = trackInfo.album ?? `${trackInfo.uploader ?? 'SoundCloud'} - SoundCloud`;

      return [
        {
          title: trackInfo.title,
          duration: Math.floor(trackInfo.duration),
          sourceUrl: trackInfo.webpage_url,
          artistName,
          albumName,
          coverUrl: trackInfo.thumbnail,
          metadata: {
            year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
            bitrate: trackInfo.tbr,
            format: trackInfo.ext,
          },
        },
      ];
    } catch (error) {
      console.error(`Error getting tracks from SoundCloud URL ${url}: ${error}`);
      throw error;
    }
  }
}
