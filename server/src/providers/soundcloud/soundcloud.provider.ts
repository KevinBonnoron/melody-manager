import type { ResolvedTrack, SearchResult, SearchType, TrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { $ } from 'bun';
import type { YtDlpTrackInfo } from '../../types';
import * as ytDlp from '../../utils/yt-dlp.util';
import type { ResolvedStream, SearchProvider } from '../types';

async function searchSoundCloud(query: string, maxResults = 20): Promise<YtDlpTrackInfo[]> {
  try {
    const searchQuery = `scsearch${maxResults}:${query}`;
    const result = await $`yt-dlp -j ${searchQuery}`.text();
    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    console.error(`Error searching SoundCloud: ${error}`);
    return [];
  }
}

export class SoundcloudProvider implements SearchProvider {
  public async search(query: string, type: SearchType, _provider: TrackProvider): Promise<SearchResult[]> {
    if (type !== 'track') {
      return [];
    }

    return this.searchTracks(query);
  }

  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    const streamUrl = await ytDlp.getValidStreamUrl(sourceUrl);
    return {
      type: 'url',
      url: streamUrl,
      download: () => ytDlp.downloadAudio(sourceUrl),
    };
  }

  public async resolveTracks(url: string, _provider: TrackProvider): Promise<ResolvedTrack[]> {
    const trackInfo = await ytDlp.extractTrackInfo(url);
    if (!trackInfo) {
      throw new Error('Failed to extract track info from SoundCloud URL');
    }

    return [ytDlp.buildSingleTrack(trackInfo, 'SoundCloud')];
  }

  private async searchTracks(query: string): Promise<TrackSearchResult[]> {
    try {
      const results = await searchSoundCloud(query, 20);
      return results.map((info) => ({
        type: 'track' as const,
        provider: 'soundcloud' as const,
        title: info.title ?? 'Unknown Title',
        artist: info.artist ?? info.uploader,
        album: info.album,
        coverUrl: info.thumbnail,
        sourceUrl: info.webpage_url,
        duration: info.duration ? Math.floor(info.duration) : undefined,
      }));
    } catch (error) {
      console.error(`Error searching SoundCloud: ${error}`);
      return [];
    }
  }
}
