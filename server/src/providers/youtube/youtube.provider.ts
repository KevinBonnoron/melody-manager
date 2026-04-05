import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, ResolvedAlbum, ResolvedArtist, ResolvedPlaylist, ResolvedTrack, SearchResult, SearchType, TrackMetadata, TrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { $ } from 'bun';
import { logger } from '../../lib/logger';
import type { YtDlpTrackInfo } from '../../types';
import { deleteCookiesFile, ffmpeg, ProviderAuthError } from '../../utils';
import * as ytDlp from '../../utils/yt-dlp.util';
import type { DownloadedTrack, DownloadProvider, ResolvedStream, SearchProvider } from '../types';

function cookiesArgs(cookiesFile?: string): string[] {
  return cookiesFile ? ['--cookies', cookiesFile] : [];
}

async function searchYoutubeTracks(query: string, maxResults = 20, cookiesFile?: string): Promise<YtDlpTrackInfo[]> {
  try {
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
    const cookies = cookiesArgs(cookiesFile);
    const result = await $`yt-dlp -j --flat-playlist --playlist-end ${maxResults} ${cookies} ${searchUrl}`.text();
    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    return lines
      .map((line) => {
        const info = JSON.parse(line);
        if (!info.thumbnail && info.id) {
          info.thumbnail = `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`;
        }

        return info;
      })
      .filter((info) => typeof info.duration === 'number' && info.duration > 0);
  } catch (error) {
    logger.error(`Error searching YouTube: ${error}`);
    return [];
  }
}

async function searchYoutubeAlbums(query: string, maxResults = 20, cookiesFile?: string): Promise<YtDlpTrackInfo[]> {
  try {
    const searchQuery = `ytsearch${maxResults}:${query} full album`;
    const cookies = cookiesArgs(cookiesFile);
    const result = await $`yt-dlp -j --flat-playlist ${cookies} --extractor-args "youtube:player_client=default" ${searchQuery}`.text();
    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    return lines.map((line) => {
      const info = JSON.parse(line);
      if (!info.thumbnail && info.id) {
        info.thumbnail = `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`;
      }

      return info;
    });
  } catch (error) {
    logger.error(`Error searching YouTube albums: ${error}`);
    return [];
  }
}

async function searchYoutubeArtists(query: string, maxResults = 20, cookiesFile?: string): Promise<YtDlpTrackInfo[]> {
  try {
    const results: YtDlpTrackInfo[] = [];
    const cookies = cookiesArgs(cookiesFile);
    const topicQuery = `ytsearch${Math.ceil(maxResults / 2)}:${query} - Topic`;
    const topicResult = await $`yt-dlp -j --flat-playlist ${cookies} --extractor-args "youtube:player_client=default" ${topicQuery}`.text();
    const topicLines = topicResult
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    const topicChannels = topicLines.map((l) => JSON.parse(l)).filter((info: YtDlpTrackInfo) => info.channel?.includes('- Topic') || info.uploader?.includes('- Topic') || info.title?.includes('- Topic'));
    results.push(...topicChannels);

    const channelQuery = `ytsearch${Math.ceil(maxResults / 2)}:${query} channel`;
    const channelResult = await $`yt-dlp -j --flat-playlist ${cookies} --extractor-args "youtube:player_client=default" ${channelQuery}`.text();
    const channelLines = channelResult
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    const channels = channelLines.map((l) => JSON.parse(l)).filter((info: YtDlpTrackInfo) => info.channel_url || info.uploader_url || info.webpage_url?.includes('/@'));
    const uniqueUrls = new Set(results.map((r) => r.channel_url || r.uploader_url || r.webpage_url));
    for (const channel of channels) {
      const url = channel.channel_url || channel.uploader_url || channel.webpage_url;
      if (url && !uniqueUrls.has(url)) {
        results.push(channel);
        uniqueUrls.add(url);
      }
    }

    return results.slice(0, maxResults);
  } catch (error) {
    logger.error(`Error searching YouTube artists: ${error}`);
    return [];
  }
}

async function extractChannelTracks(channelUrl: string, maxResults = 100, cookiesFile?: string): Promise<YtDlpTrackInfo[]> {
  try {
    const cookies = cookiesArgs(cookiesFile);
    const result = await $`yt-dlp -j --flat-playlist --playlist-end ${maxResults} ${cookies} --extractor-args "youtube:player_client=default" ${channelUrl}/videos`.text();
    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '');
    return lines.map((line) => {
      const info = JSON.parse(line);
      if (!info.thumbnail && info.id) {
        info.thumbnail = `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`;
      }

      if (!info.webpage_url && info.id) {
        info.webpage_url = `https://www.youtube.com/watch?v=${info.id}`;
      }

      return info;
    });
  } catch (error) {
    logger.error(`Error extracting channel tracks: ${error}`);
    return [];
  }
}

function isBotDetectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('sign in') || msg.includes('bot') || msg.includes('429') || msg.includes('cookie') || msg.includes('confirm your age');
}

function extractYoutubeId(url: string): string | undefined {
  const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/, /youtube\.com\/embed\/([^&\n?#]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function isYoutubeUrl(query: string): boolean {
  return query.includes('youtube.com/watch') || query.includes('youtu.be/') || query.includes('youtube.com/shorts/');
}

function isYoutubePlaylistUrl(query: string): boolean {
  return query.includes('youtube.com/playlist');
}

function normalizeYoutubeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.slice(1).split('/')[0];
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (parsed.hostname.endsWith('youtube.com')) {
      if (parsed.pathname === '/playlist') {
        const listId = parsed.searchParams.get('list');
        if (listId) {
          return `https://www.youtube.com/playlist?list=${listId}`;
        }
      }

      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/shorts/${shortsMatch[1]}`;
      }
    }
  } catch {
    // Not a valid URL (plain search query) — return as-is
  }

  return url;
}

function sanitizeFilename(name: string): string {
  return name // biome-ignore lint/suspicious/noControlCharactersInRegex: need to strip control chars from filenames
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanChapterTitle(title: string): string {
  const trim = (s: string) => s.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
  let t = trim(title);
  const m = t.match(/^(\d+(?:-\d+)?)[\s\u3000.]+(.+)$/);
  if (m?.[2]) {
    t = trim(m[2]);
  }

  return t;
}

export class YoutubeProvider implements SearchProvider, DownloadProvider {
  /** Run a callback with a temporary cookies file, cleaning it up automatically. */
  private async withCookies<T>(provider: TrackProvider, fn: (cookiesFile?: string) => Promise<T>): Promise<T> {
    const cookies = provider.config.cookies as string | undefined;
    let cookiesFile: string | undefined;
    if (cookies?.trim()) {
      cookiesFile = join(tmpdir(), `yt-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
      await writeFile(cookiesFile, cookies.trim(), 'utf-8');
    }

    try {
      return await fn(cookiesFile);
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  public async search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]> {
    query = normalizeYoutubeUrl(query);

    switch (type) {
      case 'track':
        return this.searchTracks(query, provider);
      case 'album':
        return this.searchAlbums(query, provider);
      case 'artist':
        return this.searchArtists(query, provider);
      case 'playlist':
        return this.searchPlaylists(query, provider);
      default:
        return [];
    }
  }

  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    const streamUrl = await ytDlp.getValidStreamUrl(sourceUrl);
    return { type: 'url', url: streamUrl };
  }

  public async downloadAlbumTracks(tracks: { sourceUrl: string; title: string; trackNumber: number; startTime?: number; endTime?: number; albumName: string; artistName: string }[], provider: TrackProvider): Promise<DownloadedTrack[]> {
    const downloadPath = provider.config.downloadPath as string | undefined;
    if (!downloadPath) {
      throw new Error('downloadPath is not configured for this provider');
    }

    if (tracks.length === 0) {
      return [];
    }

    const firstTrack = tracks[0];
    if (!firstTrack) {
      return [];
    }

    const albumDir = join(downloadPath, sanitizeFilename(firstTrack.artistName), sanitizeFilename(firstTrack.albumName));
    if (!existsSync(albumDir)) {
      mkdirSync(albumDir, { recursive: true });
    }

    const fullAudioPath = await ytDlp.downloadAudio(firstTrack.sourceUrl);
    try {
      const results: DownloadedTrack[] = [];
      for (const track of tracks) {
        const paddedNum = String(track.trackNumber).padStart(2, '0');
        const ext = extname(fullAudioPath) || '.m4a';
        const filename = `${paddedNum} - ${sanitizeFilename(track.title)}${ext}`;
        const outputPath = join(albumDir, filename);
        let cmd = ffmpeg();
        if (track.startTime !== undefined && track.startTime > 0) {
          cmd = cmd.seekInput(track.startTime);
        }

        cmd = cmd.input(fullAudioPath);

        if (track.endTime !== undefined) {
          const duration = track.endTime - (track.startTime ?? 0);
          cmd = cmd.duration(duration);
        }

        cmd = cmd.codec({ type: 'copy' }).overwrite().output(outputPath);
        await cmd.run();
        results.push({ sourceUrl: track.sourceUrl, startTime: track.startTime, localPath: outputPath });
      }

      return results;
    } finally {
      ytDlp.cleanupTempFile(fullAudioPath);
    }
  }

  // --- TrackResolver ---

  public async resolveTracks(url: string, provider: TrackProvider): Promise<ResolvedTrack[]> {
    return this.withCookies(provider, async (cookiesFile) => {
      const normalized = normalizeYoutubeUrl(url);
      const trackInfo = await ytDlp.extractTrackInfo(normalized, { cookiesFile });
      if (!trackInfo) {
        throw new Error('Failed to extract track info from URL');
      }

      if (trackInfo.chapters?.length) {
        return this.buildAlbumFromInfo(trackInfo).tracks;
      }

      return [ytDlp.buildSingleTrack(trackInfo, 'YouTube')];
    });
  }

  // --- AlbumResolver ---

  public async resolveAlbum(url: string, provider: TrackProvider): Promise<ResolvedAlbum> {
    const normalized = normalizeYoutubeUrl(url);

    if (normalized.includes('playlist') || normalized.includes('list=')) {
      return this.withCookies(provider, async (cookiesFile) => {
        const tracks = await this.fetchPlaylistTracks(url, cookiesFile);
        const firstTrack = tracks[0];
        return {
          name: firstTrack?.albumName ?? 'YouTube Playlist',
          artistName: firstTrack?.artistName ?? 'Unknown Artist',
          coverUrl: firstTrack?.coverUrl,
          tracks,
        };
      });
    }

    return this.withCookies(provider, async (cookiesFile) => {
      const trackInfo = await ytDlp.extractTrackInfo(normalized, { withComments: true, cookiesFile });
      if (!trackInfo) {
        throw new Error('Failed to extract album info from URL');
      }

      if (trackInfo.chapters?.length) {
        return this.buildAlbumFromInfo(trackInfo);
      }

      throw new Error('URL is not an album (no playlist or chapters found)');
    });
  }

  // --- ArtistResolver ---

  public async resolveArtist(url: string, provider: TrackProvider): Promise<ResolvedArtist> {
    return this.withCookies(provider, async (cookiesFile) => {
      const channelTracks = await extractChannelTracks(url, 200, cookiesFile);
      const BATCH_SIZE = 5;
      const tracks: ResolvedTrack[] = [];

      for (let i = 0; i < channelTracks.length; i += BATCH_SIZE) {
        const batch = channelTracks.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((info) => ytDlp.extractTrackInfo(info.webpage_url, { cookiesFile })));

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            tracks.push(ytDlp.buildSingleTrack(result.value, 'YouTube'));
          }
        }
      }

      const artistName = channelTracks[0]?.channel ?? channelTracks[0]?.uploader ?? 'Unknown Artist';
      return { name: artistName, tracks };
    });
  }

  // --- PlaylistResolver ---

  public async resolvePlaylist(url: string, provider: TrackProvider): Promise<ResolvedPlaylist> {
    return this.withCookies(provider, async (cookiesFile) => {
      const tracks = await this.fetchPlaylistTracks(url, cookiesFile);
      return { name: 'YouTube Playlist', tracks };
    });
  }

  // --- Search methods ---

  private async searchTracks(query: string, provider: TrackProvider): Promise<TrackSearchResult[]> {
    return this.withCookies(provider, async (cookiesFile) => {
      try {
        if (isYoutubeUrl(query)) {
          const trackInfo = await ytDlp.extractTrackInfo(query, { cookiesFile });
          if (!trackInfo || trackInfo.chapters?.length) {
            return [];
          }

          return [
            {
              type: 'track',
              provider: 'youtube',
              title: trackInfo.title ?? 'Unknown Title',
              artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
              album: trackInfo.album,
              thumbnail: trackInfo.thumbnail,
              externalUrl: trackInfo.webpage_url,
              duration: trackInfo.duration ? Math.floor(trackInfo.duration) : undefined,
            },
          ];
        }

        const results = await searchYoutubeTracks(query, 20, cookiesFile);
        return results.map((info) => ({
          type: 'track' as const,
          provider: 'youtube' as const,
          title: info.title ?? 'Unknown Title',
          artist: info.artist ?? info.uploader ?? info.channel,
          album: info.album,
          thumbnail: info.thumbnail,
          externalUrl: info.webpage_url,
          duration: info.duration ? Math.floor(info.duration) : undefined,
        }));
      } catch (error) {
        if (isBotDetectionError(error)) {
          throw new ProviderAuthError('COOKIES_REQUIRED', 'youtube', `YouTube bot detection: ${error}`);
        }

        logger.error(`Error searching YouTube tracks: ${error}`);
        return [];
      }
    });
  }

  private async searchAlbums(query: string, provider: TrackProvider): Promise<AlbumSearchResult[]> {
    return this.withCookies(provider, async (cookiesFile) => {
      try {
        if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
          if (!isYoutubePlaylistUrl(query)) {
            const trackInfo = await ytDlp.extractTrackInfo(query, { cookiesFile });
            if (trackInfo?.chapters?.length) {
              return [
                {
                  type: 'album',
                  provider: 'youtube',
                  name: trackInfo.title ?? 'Unknown Album',
                  artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
                  coverUrl: trackInfo.thumbnail?.startsWith('data:') ? undefined : trackInfo.thumbnail,
                  externalUrl: trackInfo.webpage_url,
                  trackCount: trackInfo.chapters.length,
                },
              ];
            }
          }

          return [];
        }

        const results = await searchYoutubeAlbums(query, 20, cookiesFile);
        return results.map((info) => ({
          type: 'album' as const,
          provider: 'youtube' as const,
          name: info.title ?? 'Unknown Album',
          artist: info.artist ?? info.uploader ?? info.channel,
          coverUrl: info.thumbnail,
          externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
          trackCount: undefined,
        }));
      } catch (error) {
        if (isBotDetectionError(error)) {
          throw new ProviderAuthError('COOKIES_REQUIRED', 'youtube', `YouTube bot detection: ${error}`);
        }

        logger.error(`Error searching YouTube albums: ${error}`);
        return [];
      }
    });
  }

  private async searchArtists(query: string, provider: TrackProvider): Promise<ArtistSearchResult[]> {
    return this.withCookies(provider, async (cookiesFile) => {
      try {
        if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
          return [];
        }

        const results = await searchYoutubeArtists(query, 20, cookiesFile);
        return results.map((info) => ({
          type: 'artist' as const,
          provider: 'youtube' as const,
          name: (info.channel || info.uploader || info.title)?.replace(' - Topic', '') ?? 'Unknown Artist',
          imageUrl: info.thumbnail,
          externalUrl: (info.channel_url || info.uploader_url || info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`) as string,
        }));
      } catch (error) {
        logger.error(`Error searching YouTube artists: ${error}`);
        return [];
      }
    });
  }

  private async searchPlaylists(_query: string, _provider: TrackProvider): Promise<PlaylistSearchResult[]> {
    return [];
  }

  // --- Private helpers ---

  private async fetchPlaylistTracks(url: string, cookiesFile?: string): Promise<ResolvedTrack[]> {
    const playlistTracks = await ytDlp.extractPlaylistTracks(url, cookiesFile);
    const tracks: ResolvedTrack[] = [];
    for (const info of playlistTracks) {
      try {
        const fullInfo = await ytDlp.extractTrackInfo(info.webpage_url, { cookiesFile });
        if (fullInfo) {
          tracks.push(ytDlp.buildSingleTrack(fullInfo, 'YouTube'));
        }
      } catch (error) {
        logger.error(`Error processing track ${info.webpage_url}: ${error}`);
      }
    }

    return tracks;
  }

  private buildAlbumFromInfo(trackInfo: YtDlpTrackInfo): ResolvedAlbum {
    const artistName = trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel ?? 'Unknown Artist';
    const albumName = trackInfo.title ?? trackInfo.album ?? 'Unknown Album';
    const thumbnail = trackInfo.thumbnail?.startsWith('data:') ? undefined : trackInfo.thumbnail;
    const baseMetadata: TrackMetadata = {
      year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
      bitrate: trackInfo.tbr,
      format: trackInfo.ext,
      coverArtUrl: thumbnail,
      youtubeId: extractYoutubeId(trackInfo.webpage_url),
    };

    const tracks = trackInfo
      .chapters!.filter((ch): ch is NonNullable<typeof ch> => !!ch)
      .map((chapter) => ({
        title: cleanChapterTitle(chapter.title),
        duration: Math.floor(chapter.end_time - chapter.start_time),
        sourceUrl: trackInfo.webpage_url,
        artistName,
        albumName,
        coverUrl: thumbnail,
        metadata: { ...baseMetadata, startTime: chapter.start_time, endTime: chapter.end_time },
      }));

    return { name: albumName, artistName, coverUrl: thumbnail, tracks };
  }
}
