import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { DownloadedTrack, DownloadProvider, ImportProvider, PluginImportTrack, PluginStreamDeps, ResolvedStream, SearchProvider, YtDlpTrackInfo } from '@melody-manager/plugin-sdk';
import { deleteCookiesFile, ffmpeg, ProviderAuthError, YtDlpService } from '@melody-manager/plugin-sdk';
import type { AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, SearchResult, SearchType, TrackMetadata, TrackProvider, TrackSearchResult } from '@melody-manager/shared';

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

export class YoutubePlugin implements SearchProvider, ImportProvider, DownloadProvider {
  private readonly ytDlpService: YtDlpService;

  public constructor(deps: PluginStreamDeps) {
    this.ytDlpService = new YtDlpService(deps.logger);
  }

  private async createCookiesFile(provider: TrackProvider): Promise<string | undefined> {
    const cookies = provider.config.cookies as string | undefined;
    if (!cookies?.trim()) {
      return undefined;
    }
    const cookiesFile = join(tmpdir(), `yt-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    await writeFile(cookiesFile, cookies.trim(), 'utf-8');
    return cookiesFile;
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
    const streamUrl = await this.getValidStreamUrl(sourceUrl);
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

    // Download the full audio file once
    const sourceUrl = firstTrack.sourceUrl;
    const fullAudioPath = await this.ytDlpService.downloadAudio(sourceUrl);

    try {
      const results: DownloadedTrack[] = [];

      for (const track of tracks) {
        const paddedNum = String(track.trackNumber).padStart(2, '0');
        const ext = extname(fullAudioPath) || '.m4a';
        const filename = `${paddedNum} - ${sanitizeFilename(track.title)}${ext}`;
        const outputPath = join(albumDir, filename);

        // Extract chapter segment with FFmpeg
        let cmd = ffmpeg();

        if (track.startTime !== undefined && track.startTime > 0) {
          cmd = cmd.seekInput(track.startTime);
        }

        cmd = cmd.input(fullAudioPath);

        if (track.endTime !== undefined) {
          const duration = (track.startTime ?? 0) > 0 ? track.endTime - (track.startTime ?? 0) : track.endTime;
          cmd = cmd.duration(duration);
        }

        cmd = cmd.codec({ type: 'copy' }).overwrite().output(outputPath);

        await cmd.run();

        results.push({
          sourceUrl: track.sourceUrl,
          startTime: track.startTime,
          localPath: outputPath,
        });
      }

      return results;
    } finally {
      await this.ytDlpService.cleanupTempFile(fullAudioPath);
    }
  }

  private async getValidStreamUrl(sourceUrl: string): Promise<string> {
    const streamUrl = await this.ytDlpService.getStreamUrl(sourceUrl);
    const probe = await fetch(streamUrl, { method: 'HEAD' });
    if (probe.ok) {
      return streamUrl;
    }
    console.warn(`[YouTube] Cached stream URL expired for ${sourceUrl}, re-extracting`);
    this.ytDlpService.invalidateStreamUrl(sourceUrl);
    return this.ytDlpService.getStreamUrl(sourceUrl);
  }

  private async searchTracks(query: string, provider: TrackProvider): Promise<TrackSearchResult[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      if (isYoutubeUrl(query)) {
        const trackInfo = await this.ytDlpService.extractTrackInfo(query, { cookiesFile });
        if (!trackInfo) {
          return [];
        }

        // Video with chapters → surfaced as an album, not a single track
        if (trackInfo.chapters?.length) {
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

      const results = await this.ytDlpService.searchYoutube(query, 20, cookiesFile);
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
      console.error(`Error searching YouTube tracks: ${error}`);
      return [];
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  private async searchAlbums(query: string, provider: TrackProvider): Promise<AlbumSearchResult[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
        if (!isYoutubePlaylistUrl(query)) {
          const trackInfo = await this.ytDlpService.extractTrackInfo(query, { cookiesFile });
          if (trackInfo?.chapters?.length) {
            return [
              {
                type: 'album',
                provider: 'youtube',
                name: trackInfo.title ?? 'Unknown Album',
                artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
                coverUrl: trackInfo.thumbnail,
                externalUrl: trackInfo.webpage_url,
                trackCount: trackInfo.chapters.length,
              },
            ];
          }
        }
        // URL without chapters — not an album, skip text search
        return [];
      }
      const results = await this.ytDlpService.searchYoutubeAlbums(query, 20, cookiesFile);
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
      console.error(`Error searching YouTube albums: ${error}`);
      return [];
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  private async searchArtists(query: string, provider: TrackProvider): Promise<ArtistSearchResult[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
        return [];
      }
      const results = await this.ytDlpService.searchYoutubeArtists(query, 20, cookiesFile);
      return results.map((info) => ({
        type: 'artist' as const,
        provider: 'youtube' as const,
        name: (info.channel || info.uploader || info.title)?.replace(' - Topic', '') ?? 'Unknown Artist',
        imageUrl: info.thumbnail,
        externalUrl: (info.channel_url || info.uploader_url || info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`) as string,
      }));
    } catch (error) {
      console.error(`Error searching YouTube artists: ${error}`);
      return [];
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  private async searchPlaylists(query: string, provider: TrackProvider): Promise<PlaylistSearchResult[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
        return [];
      }
      const results = await this.ytDlpService.searchYoutubePlaylists(query, 20);
      return results.map((info) => ({
        type: 'playlist' as const,
        provider: 'youtube' as const,
        name: info.title ?? 'Unknown Playlist',
        description: info.description,
        coverUrl: info.thumbnail,
        externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        trackCount: info.playlist_count as number | undefined,
        owner: info.uploader ?? info.channel,
      }));
    } catch (error) {
      console.error(`Error searching YouTube playlists: ${error}`);
      return [];
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  public async getTracks(url: string, provider: TrackProvider): Promise<PluginImportTrack[]> {
    url = normalizeYoutubeUrl(url);
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      const trackInfo = await this.ytDlpService.extractTrackInfo(url, { cookiesFile });
      if (!trackInfo) {
        throw new Error('Failed to extract track info from URL');
      }

      // Delegate to album import when chapters are detected — it fetches comments for complete tracklists
      if (trackInfo.chapters?.length) {
        return this.getAlbumTracks(url, provider);
      }

      return this.buildImportTracksFromInfo(trackInfo);
    } catch (error) {
      console.error(`Error getting tracks from URL ${url}: ${error}`);
      throw error;
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  public async getAlbumTracks(url: string, provider: TrackProvider): Promise<PluginImportTrack[]> {
    url = normalizeYoutubeUrl(url);
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      if (url.includes('playlist') || url.includes('list=')) {
        return this.getPlaylistTracks(url, provider);
      }
      // Always fetch with comments — descriptions are often truncated by YouTube
      const trackInfo = await this.ytDlpService.extractTrackInfo(url, { withComments: true, cookiesFile });
      if (!trackInfo) {
        throw new Error('Failed to extract album info from URL');
      }

      if (trackInfo.chapters?.length) {
        return this.buildImportTracksFromInfo(trackInfo);
      }

      throw new Error('URL is not an album (no playlist or chapters found)');
    } catch (error) {
      console.error(`Error getting album tracks from URL ${url}: ${error}`);
      throw error;
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  public async getArtistTracks(url: string, provider: TrackProvider): Promise<PluginImportTrack[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      const channelTracks = await this.ytDlpService.extractChannelTracks(url, 200, cookiesFile);
      const all: PluginImportTrack[] = [];
      for (const info of channelTracks) {
        try {
          const fullInfo = await this.ytDlpService.extractTrackInfo(info.webpage_url, { cookiesFile });
          if (fullInfo) {
            all.push(...this.buildImportTracksFromInfo(fullInfo));
          }
        } catch (error) {
          console.error(`Error processing track ${info.webpage_url}: ${error}`);
        }
      }
      return all;
    } catch (error) {
      console.error(`Error getting artist tracks from URL ${url}: ${error}`);
      throw error;
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  public async getPlaylistTracks(url: string, provider: TrackProvider): Promise<PluginImportTrack[]> {
    const cookiesFile = await this.createCookiesFile(provider);
    try {
      const playlistTracks = await this.ytDlpService.extractPlaylistTracks(url, cookiesFile);
      const all: PluginImportTrack[] = [];
      for (const info of playlistTracks) {
        try {
          const fullInfo = await this.ytDlpService.extractTrackInfo(info.webpage_url, { cookiesFile });
          if (fullInfo) {
            all.push(...this.buildImportTracksFromInfo(fullInfo));
          }
        } catch (error) {
          console.error(`Error processing track ${info.webpage_url}: ${error}`);
        }
      }
      return all;
    } catch (error) {
      console.error(`Error getting playlist tracks from URL ${url}: ${error}`);
      throw error;
    } finally {
      if (cookiesFile) {
        await deleteCookiesFile(cookiesFile);
      }
    }
  }

  private buildImportTracksFromInfo(trackInfo: YtDlpTrackInfo): PluginImportTrack[] {
    const artistName = trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel ?? 'Unknown Artist';
    const albumName = trackInfo.album ?? `${trackInfo.channel ?? trackInfo.uploader} - YouTube`;
    const baseMetadata: TrackMetadata = {
      year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
      bitrate: trackInfo.tbr,
      format: trackInfo.ext,
      coverArtUrl: trackInfo.thumbnail,
      youtubeId: extractYoutubeId(trackInfo.webpage_url),
    };

    if (trackInfo.chapters && trackInfo.chapters.length > 0) {
      const cleanTitle = (title: string) => {
        const trim = (s: string) => s.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        let t = trim(title);
        const m = t.match(/^(\d+)[\s\u3000.]+(.+)$/);
        if (m?.[2]) {
          t = trim(m[2]);
        }
        return t;
      };

      return trackInfo.chapters
        .filter((ch): ch is NonNullable<typeof ch> => !!ch)
        .map((chapter) => ({
          title: cleanTitle(chapter.title),
          duration: Math.floor(chapter.end_time - chapter.start_time),
          sourceUrl: trackInfo.webpage_url,
          artistName,
          albumName: trackInfo.title ?? albumName,
          coverUrl: trackInfo.thumbnail,
          metadata: {
            ...baseMetadata,
            startTime: chapter.start_time,
            endTime: chapter.end_time,
          },
        }));
    }

    return [
      {
        title: trackInfo.title,
        duration: Math.floor(trackInfo.duration),
        sourceUrl: trackInfo.webpage_url,
        artistName,
        albumName,
        coverUrl: trackInfo.thumbnail,
        metadata: {
          ...baseMetadata,
          chapters: trackInfo.chapters?.map(
            (ch) =>
              ({
                title: ch.title,
                startTime: ch.start_time,
                endTime: ch.end_time,
              }) as { title: string; startTime: number; endTime: number },
          ),
        },
      },
    ];
  }
}
