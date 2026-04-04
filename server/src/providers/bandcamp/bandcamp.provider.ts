import type { ResolvedAlbum, ResolvedArtist, ResolvedTrack, TrackProvider } from '@melody-manager/shared';
import * as ytDlp from '../../utils/yt-dlp.util';
import type { ResolvedStream } from '../types';

export class BandcampProvider {
  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    const resolvedUrl = await this.resolveBandcampUrl(sourceUrl);
    const streamUrl = await ytDlp.getValidStreamUrl(resolvedUrl);
    return { type: 'url', url: streamUrl };
  }

  public async resolveTracks(url: string, _provider: TrackProvider): Promise<ResolvedTrack[]> {
    const trackInfo = await ytDlp.extractTrackInfo(url);
    if (!trackInfo) {
      throw new Error('Failed to extract track info from Bandcamp URL');
    }

    return [ytDlp.buildSingleTrack(trackInfo, 'Bandcamp')];
  }

  public async resolveAlbum(url: string, _provider: TrackProvider): Promise<ResolvedAlbum> {
    const entries = await ytDlp.extractPlaylistTracks(url);
    if (!entries.length) {
      throw new Error('No tracks found in Bandcamp album');
    }

    const tracks: ResolvedTrack[] = [];
    for (const entry of entries) {
      const trackInfo = await ytDlp.extractTrackInfo(entry.webpage_url);
      if (trackInfo) {
        tracks.push(ytDlp.buildSingleTrack(trackInfo, 'Bandcamp'));
      }
    }

    if (tracks.length === 0) {
      throw new Error('Failed to extract any tracks from Bandcamp album');
    }

    const firstTrack = tracks[0];
    return {
      name: firstTrack?.albumName ?? 'Unknown Album',
      artistName: firstTrack?.artistName ?? 'Unknown Artist',
      coverUrl: firstTrack?.coverUrl,
      tracks,
    };
  }

  public async resolveArtist(url: string, _provider: TrackProvider): Promise<ResolvedArtist> {
    const entries = await ytDlp.extractPlaylistTracks(url);
    if (!entries.length) {
      throw new Error('No tracks found on Bandcamp artist page');
    }

    const tracks: ResolvedTrack[] = [];
    for (const entry of entries) {
      const trackInfo = await ytDlp.extractTrackInfo(entry.webpage_url);
      if (trackInfo) {
        tracks.push(ytDlp.buildSingleTrack(trackInfo, 'Bandcamp'));
      }
    }

    if (tracks.length === 0) {
      throw new Error('Failed to extract any tracks from Bandcamp artist');
    }

    const artistName = tracks[0]?.artistName ?? 'Unknown Artist';
    return { name: artistName, tracks };
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

    const tracks = await ytDlp.extractPlaylistTracks(parsed.albumUrl);
    const normalizedTarget = parsed.trackName.toLowerCase().trim();
    const exactMatch = tracks.find((t) => t.title?.toLowerCase().trim() === normalizedTarget);
    if (exactMatch?.webpage_url) {
      return exactMatch.webpage_url;
    }

    const partial = tracks.find((t) => t.title?.toLowerCase().includes(normalizedTarget) || normalizedTarget.includes(t.title?.toLowerCase() ?? ''));
    if (partial?.webpage_url) {
      return partial.webpage_url;
    }

    throw new Error(`Track "${parsed.trackName}" not found in album ${parsed.albumUrl}`);
  }
}
