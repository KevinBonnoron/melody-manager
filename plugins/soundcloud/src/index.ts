import type { ImportProvider, PluginImportTrack, PluginStreamDeps, ResolvedStream, SearchProvider } from '@melody-manager/plugin-sdk';
import { YtDlpService } from '@melody-manager/plugin-sdk';
import type { SearchResult, SearchType, TrackProvider, TrackSearchResult } from '@melody-manager/shared';

export class SoundcloudPlugin implements SearchProvider, ImportProvider {
  private readonly ytDlpService: YtDlpService;

  public constructor(deps: PluginStreamDeps) {
    this.ytDlpService = new YtDlpService(deps.logger);
  }

  public async search(query: string, type: SearchType, _provider: TrackProvider): Promise<SearchResult[]> {
    if (type !== 'track') {
      return [];
    }
    return this.searchTracks(query);
  }

  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    const streamUrl = await this.getValidStreamUrl(sourceUrl);
    return {
      type: 'url',
      url: streamUrl,
      download: () => this.ytDlpService.downloadAudio(sourceUrl),
    };
  }

  public async getTracks(url: string, _provider: TrackProvider): Promise<PluginImportTrack[]> {
    try {
      const trackInfo = await this.ytDlpService.extractTrackInfo(url);
      if (!trackInfo) {
        throw new Error('Failed to extract track info from SoundCloud URL');
      }

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
            coverArtUrl: trackInfo.thumbnail,
          },
        },
      ];
    } catch (error) {
      console.error(`Error getting tracks from SoundCloud URL ${url}: ${error}`);
      throw error;
    }
  }

  private async getValidStreamUrl(sourceUrl: string): Promise<string> {
    const streamUrl = await this.ytDlpService.getStreamUrl(sourceUrl);
    const probe = await fetch(streamUrl, { method: 'HEAD' });
    if (probe.ok) {
      return streamUrl;
    }
    console.warn(`[SoundCloud] Cached stream URL expired for ${sourceUrl}, re-extracting`);
    this.ytDlpService.invalidateStreamUrl(sourceUrl);
    return this.ytDlpService.getStreamUrl(sourceUrl);
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
}
