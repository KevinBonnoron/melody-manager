import type { ImportProvider, PluginImportTrack, PluginStreamDeps, ResolvedStream } from '@melody-manager/plugin-sdk';
import { YtDlpService } from '@melody-manager/plugin-sdk';
import type { TrackProvider } from '@melody-manager/shared';

export class BandcampPlugin implements ImportProvider {
  private readonly ytDlpService: YtDlpService;

  public constructor(deps: PluginStreamDeps) {
    this.ytDlpService = new YtDlpService(deps.logger);
  }

  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    const resolvedUrl = await this.resolveBandcampUrl(sourceUrl);
    const streamUrl = await this.getValidStreamUrl(resolvedUrl);
    return { type: 'url', url: streamUrl };
  }

  public async getTracks(url: string, _provider: TrackProvider): Promise<PluginImportTrack[]> {
    const trackInfo = await this.ytDlpService.extractTrackInfo(url);
    if (!trackInfo) {
      throw new Error('Failed to extract track info from Bandcamp URL');
    }

    const artistName = trackInfo.artist ?? trackInfo.uploader ?? 'Unknown Artist';
    const albumName = trackInfo.album ?? `${trackInfo.uploader ?? 'Bandcamp'} - Bandcamp`;

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
  }

  public async getAlbumTracks(url: string, _provider: TrackProvider): Promise<PluginImportTrack[]> {
    const tracks = await this.ytDlpService.extractPlaylistTracks(url);
    if (!tracks.length) {
      throw new Error('No tracks found in Bandcamp album');
    }

    const results: PluginImportTrack[] = [];
    for (const entry of tracks) {
      const trackInfo = await this.ytDlpService.extractTrackInfo(entry.webpage_url);
      if (!trackInfo) {
        continue;
      }

      const artistName = trackInfo.artist ?? trackInfo.uploader ?? 'Unknown Artist';
      const albumName = trackInfo.album ?? `${trackInfo.uploader ?? 'Bandcamp'} - Bandcamp`;

      results.push({
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
      });
    }

    return results;
  }

  public async getArtistTracks(url: string, _provider: TrackProvider): Promise<PluginImportTrack[]> {
    // Bandcamp artist pages list albums as a "playlist"
    const entries = await this.ytDlpService.extractPlaylistTracks(url);
    if (!entries.length) {
      throw new Error('No tracks found for Bandcamp artist');
    }

    const results: PluginImportTrack[] = [];
    for (const entry of entries) {
      const trackInfo = await this.ytDlpService.extractTrackInfo(entry.webpage_url);
      if (!trackInfo) {
        continue;
      }

      const artistName = trackInfo.artist ?? trackInfo.uploader ?? 'Unknown Artist';
      const albumName = trackInfo.album ?? `${trackInfo.uploader ?? 'Bandcamp'} - Bandcamp`;

      results.push({
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
      });
    }

    return results;
  }

  private parseBandcampSourceUrl(sourceUrl: string): { albumUrl: string; trackName: string } | null {
    const match = sourceUrl.match(/^bandcamp:\/\/([^/]+)\/(.+)$/);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    return {
      albumUrl: decodeURIComponent(match[1]),
      trackName: decodeURIComponent(match[2]),
    };
  }

  private async resolveBandcampUrl(sourceUrl: string): Promise<string> {
    if (!sourceUrl.startsWith('bandcamp://')) {
      return sourceUrl;
    }

    const parsed = this.parseBandcampSourceUrl(sourceUrl);
    if (!parsed) {
      throw new Error('Invalid Bandcamp URL format');
    }

    const tracks = await this.ytDlpService.extractPlaylistTracks(parsed.albumUrl);
    const normalizedTarget = parsed.trackName.toLowerCase().trim();
    const match = tracks.find((t) => t.title?.toLowerCase().trim() === normalizedTarget);
    if (match?.webpage_url) {
      return match.webpage_url;
    }

    // Fallback: partial match
    const partial = tracks.find((t) => t.title?.toLowerCase().includes(normalizedTarget) || normalizedTarget.includes(t.title?.toLowerCase() ?? ''));
    if (partial?.webpage_url) {
      return partial.webpage_url;
    }

    throw new Error(`Track "${parsed.trackName}" not found in album ${parsed.albumUrl}`);
  }

  private async getValidStreamUrl(sourceUrl: string): Promise<string> {
    const streamUrl = await this.ytDlpService.getStreamUrl(sourceUrl);
    const probe = await fetch(streamUrl, { method: 'HEAD' });
    if (probe.ok) {
      return streamUrl;
    }
    console.warn(`[Bandcamp] Cached stream URL expired for ${sourceUrl}, re-extracting`);
    this.ytDlpService.invalidateStreamUrl(sourceUrl);
    return this.ytDlpService.getStreamUrl(sourceUrl);
  }
}
