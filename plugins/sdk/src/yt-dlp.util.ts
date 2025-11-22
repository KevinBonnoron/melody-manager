import { normalizeTrackTitle } from '@melody-manager/shared';
import { $ } from 'bun';
import { LRUCache } from 'lru-cache';
import { unlinkSync } from 'node:fs';
import { deleteCookiesFile, generateCookiesFile } from './cookies.util';
import type { ILogger } from './logger';

// --- Types ---

export interface StreamInfo {
  url: string;
}

export interface YtDlpChapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface YtDlpComment {
  id: string;
  parent: string;
  text: string;
}

type YtDlpTrackInfoFormatExt = 'mhtml' | 'm4a' | 'webm' | 'mp4';

interface YtDlpTrackInfoFormat {
  ext: YtDlpTrackInfoFormatExt;
}

export interface YtDlpTrackInfo {
  upload_date?: string;
  title: string;
  duration: number;
  uploader: string;
  channel?: string;
  album?: string;
  artist?: string;
  webpage_url: string;
  thumbnail?: string;
  format: YtDlpTrackInfoFormat[];
  ext: YtDlpTrackInfoFormatExt;
  tbr: number;
  chapters?: YtDlpChapter[];
  description?: string;
  comments?: YtDlpComment[];
  id?: string;
  url?: string;
  [key: string]: unknown;
}

export interface YtDlpChannelInfo {
  description?: string;
  thumbnail?: string;
  channel_url?: string;
  uploader_url?: string;
  channel?: string;
  uploader?: string;
  title?: string;
}

// --- Helpers ---

function parseTimeToSeconds(timeStr: string): number | null {
  const patterns = [/^(\d+):(\d+):(\d+)$/, /^(\d+):(\d+)$/];
  for (const pattern of patterns) {
    const match = timeStr.trim().match(pattern);
    if (match) {
      if (match.length === 4 && match[1] && match[2] && match[3]) {
        return Number.parseInt(match[1], 10) * 3600 + Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10);
      }
      if (match.length === 3 && match[1] && match[2]) {
        return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
      }
    }
  }
  return null;
}

function parseChaptersFromText(text: string, duration: number, logger: ILogger): YtDlpChapter[] {
  const chapters: YtDlpChapter[] = [];
  const lines = text
    .split('\n')
    .flatMap((line) => line.split(/(?<![\d:])(?=\d+:\d{2}(?::\d{2})?)/))
    .filter((line) => line.trim() !== '');

  const titlePatterns = [/^\d+\.\s+(.+?):\s+(\d+:\d{2}(?::\d{2})?)$/, /^(.+?):\s+(\d+:\d{2}(?::\d{2})?)$/];
  const timestampPatterns = [/^(\d+:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+)$/, /^\[?(\d+:\d{2}(?::\d{2})?)\]?\s*[-–—]?\s*(.+)$/, /^(\d+:\d{2}(?::\d{2})?)\s+(.+)$/];
  const trim = (str: string) => str.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    let matched = false;
    for (const pattern of titlePatterns) {
      const match = trimmedLine.match(pattern);
      if (match?.[1] && match[2]) {
        const title = trim(match[1]);
        const startTime = parseTimeToSeconds(match[2]);
        if (title && startTime !== null) {
          chapters.push({ title, start_time: startTime, end_time: 0 });
          matched = true;
        }
        break;
      }
    }
    if (matched) continue;
    for (const pattern of timestampPatterns) {
      const match = trimmedLine.match(pattern);
      if (match?.[1] && match[2]) {
        let title = trim(match[2]);
        const trackNumberMatch = title.match(/^(\d+)[\s\u3000]+(.+)$/);
        if (trackNumberMatch?.[2]) title = trim(trackNumberMatch[2]);
        const startTime = parseTimeToSeconds(match[1]);
        if (title && startTime !== null) {
          chapters.push({ title, start_time: startTime, end_time: 0 });
        }
        break;
      }
    }
  }

  if (chapters.length === 0) return [];
  chapters.sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (!chapter) continue;
    const nextChapter = chapters[i + 1];
    chapter.end_time = nextChapter ? nextChapter.start_time : duration;
    const chapterDuration = chapter.end_time - chapter.start_time;
    if (chapterDuration <= 0) {
      logger.warn(`Chapter "${chapter.title}" at ${chapter.start_time}s has invalid duration. Setting minimum 1s.`);
      chapter.end_time = chapter.start_time + 1;
      if (nextChapter && nextChapter.start_time === chapter.start_time) {
        nextChapter.start_time = chapter.end_time;
      }
    }
  }
  return chapters;
}

function handleYtDlpError(error: unknown, context: string, logger: ILogger): void {
  let errorMessage = `Failed to ${context}`;
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = (error as { stderr: Buffer | { toString(): string } }).stderr;
    const stderrText = stderr instanceof Buffer || (stderr && typeof stderr === 'object' && 'toString' in stderr) ? String(stderr) : '';
    if (stderrText.includes('cookies are no longer valid')) {
      errorMessage = `${context}: Cookies are expired or invalid.`;
    } else if (stderrText.includes('unable to extract yt initial data') || stderrText.includes('unable to extract')) {
      errorMessage = `${context}: Failed to access the service. Cookies may be invalid.`;
    } else if (stderrText.includes('Private video') || stderrText.includes('This video is private')) {
      errorMessage = `${context}: Video is private or unavailable.`;
    }
    logger.error(errorMessage);
    const firstLine = stderrText.split('\n').find((l) => l.trim() && !l.includes('WARNING'));
    if (firstLine) logger.error(`yt-dlp error: ${firstLine.trim()}`);
  } else {
    logger.error(`${errorMessage} ${error}`);
  }
}

// --- Service ---

export class YtDlpService {
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  private readonly streamInfoCache = new LRUCache<string, StreamInfo>({
    max: 1000,
    ttl: 4 * 60 * 60 * 1000,
  });

  private readonly trackInfoCache = new LRUCache<string, YtDlpTrackInfo>({
    max: 200,
    ttl: 5 * 60 * 1000,
  });

  async getStreamUrl(sourceUrl: string): Promise<string> {
    const cached = this.streamInfoCache.get(sourceUrl);
    if (cached) return cached.url;

    try {
      const isYouTube = sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be');
      const isSoundCloud = sourceUrl.includes('soundcloud.com');
      let formatSelector = 'bestaudio';
      if (isYouTube) {
        formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]';
      } else if (!isSoundCloud) {
        formatSelector = 'bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]';
      }

      const result = await $`yt-dlp -f ${formatSelector} -g --extractor-args "youtube:player_client=default" ${sourceUrl}`.text();
      const streamUrl = result.trim();
      this.streamInfoCache.set(sourceUrl, { url: streamUrl });
      return streamUrl;
    } catch (error) {
      handleYtDlpError(error, 'extract stream URL', this.logger);
      throw new Error('Failed to extract stream URL');
    }
  }

  invalidateStreamUrl(sourceUrl: string): void {
    this.streamInfoCache.delete(sourceUrl);
  }

  async extractTrackInfo(url: string): Promise<YtDlpTrackInfo | null> {
    const cached = this.trackInfoCache.get(url);
    if (cached) return cached;

    try {
      const info: YtDlpTrackInfo = await $`yt-dlp -j --write-comments --extractor-args "youtube:player_client=default" ${url}`.json();

      const cleanTitle = (title: string): string => {
        const trim = (str: string) => str.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        let cleaned = trim(title);
        const trackNumberMatch = cleaned.match(/^(\d+)[\s\u3000.]+(.+)$/);
        if (trackNumberMatch?.[2]) cleaned = trim(trackNumberMatch[2]);
        return normalizeTrackTitle(cleaned);
      };

      let hasIncompleteChapters = false;
      if (info.chapters && info.chapters.length > 1) {
        const lastChapter = info.chapters[info.chapters.length - 1];
        if (lastChapter) {
          const lastChapterDuration = lastChapter.end_time - lastChapter.start_time;
          const averageDuration = info.chapters.slice(0, -1).reduce((sum, ch) => sum + (ch.end_time - ch.start_time), 0) / (info.chapters.length - 1);
          if (lastChapterDuration > averageDuration * 3) {
            hasIncompleteChapters = true;
          }
        }
      }

      if (!info.chapters || info.chapters.length <= 1 || hasIncompleteChapters) {
        let extractedChapters: YtDlpChapter[] = [];
        if (info.comments && info.comments.length > 0 && info.duration) {
          const rootComments = info.comments.filter((c) => c.parent === 'root');
          let best: { chapters: YtDlpChapter[] } | null = null;
          for (const comment of rootComments) {
            const chaptersFromComment = parseChaptersFromText(comment.text, info.duration, this.logger);
            if (chaptersFromComment.length <= 1) continue;
            const lastEnd = chaptersFromComment[chaptersFromComment.length - 1]?.end_time ?? 0;
            const coverage = Math.min(1, lastEnd / info.duration);
            const bestLastEnd = best ? (best.chapters[best.chapters.length - 1]?.end_time ?? 0) : 0;
            const bestCoverage = Math.min(1, bestLastEnd / info.duration);
            if (!best || chaptersFromComment.length > best.chapters.length || (chaptersFromComment.length === best.chapters.length && coverage > bestCoverage)) {
              best = { chapters: chaptersFromComment };
            }
          }
          if (best) extractedChapters = best.chapters;
        }
        if (extractedChapters.length === 0 && info.description && info.duration) {
          const fromDesc = parseChaptersFromText(info.description, info.duration, this.logger);
          if (fromDesc.length > 1) extractedChapters = fromDesc;
        }
        if (extractedChapters.length > 0) info.chapters = extractedChapters;
      }

      if (info.chapters?.length) {
        for (const chapter of info.chapters) {
          chapter.title = cleanTitle(chapter.title);
        }
      }
      this.trackInfoCache.set(url, info);
      return info;
    } catch (error) {
      this.logger.error(`Failed to extract track info: ${error}`);
      return null;
    }
  }

  async searchYoutube(query: string, maxResults = 20): Promise<YtDlpTrackInfo[]> {
    try {
      const searchQuery = `ytsearch${maxResults}:${query}`;
      const result = await $`yt-dlp -j --flat-playlist --extractor-args "youtube:player_client=default" ${searchQuery}`.text();
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
      handleYtDlpError(error, 'search YouTube', this.logger);
      return [];
    }
  }

  async searchYoutubePlaylists(_query: string, _maxResults = 20): Promise<YtDlpTrackInfo[]> {
    this.logger.warn('[YouTube] Playlist search is not supported via yt-dlp');
    return [];
  }

  async searchYoutubeArtists(query: string, maxResults = 20): Promise<YtDlpTrackInfo[]> {
    try {
      const results: YtDlpTrackInfo[] = [];
      const topicQuery = `ytsearch${Math.ceil(maxResults / 2)}:${query} - Topic`;
      const topicResult = await $`yt-dlp -j --flat-playlist --extractor-args "youtube:player_client=default" ${topicQuery}`.text();
      const topicLines = topicResult
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      const topicChannels = topicLines.map((l) => JSON.parse(l)).filter((info: YtDlpTrackInfo) => info.channel?.includes('- Topic') || info.uploader?.includes('- Topic') || info.title?.includes('- Topic'));
      results.push(...topicChannels);

      const channelQuery = `ytsearch${Math.ceil(maxResults / 2)}:${query} channel`;
      const channelResult = await $`yt-dlp -j --flat-playlist --extractor-args "youtube:player_client=default" ${channelQuery}`.text();
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
      handleYtDlpError(error, 'search YouTube artists', this.logger);
      return [];
    }
  }

  async searchYoutubeAlbums(query: string, maxResults = 20): Promise<YtDlpTrackInfo[]> {
    try {
      const searchQuery = `ytsearch${maxResults}:${query} full album`;
      const result = await $`yt-dlp -j --flat-playlist --extractor-args "youtube:player_client=default" ${searchQuery}`.text();
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
      handleYtDlpError(error, 'search YouTube albums', this.logger);
      return [];
    }
  }

  async searchSoundCloud(query: string, maxResults = 20): Promise<YtDlpTrackInfo[]> {
    try {
      const searchQuery = `scsearch${maxResults}:${query}`;
      const result = await $`yt-dlp -j ${searchQuery}`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      handleYtDlpError(error, 'search SoundCloud', this.logger);
      return [];
    }
  }

  async extractPlaylistTracks(playlistUrl: string): Promise<YtDlpTrackInfo[]> {
    try {
      const result = await $`yt-dlp -j --flat-playlist --extractor-args "youtube:player_client=default" ${playlistUrl}`.text();
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
      handleYtDlpError(error, 'extract playlist tracks', this.logger);
      return [];
    }
  }

  async extractChannelTracks(channelUrl: string, maxResults = 100): Promise<YtDlpTrackInfo[]> {
    try {
      const result = await $`yt-dlp -j --flat-playlist --playlist-end ${maxResults} --extractor-args "youtube:player_client=default" ${channelUrl}/videos`.text();
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
      handleYtDlpError(error, 'extract channel tracks', this.logger);
      return [];
    }
  }

  async extractChannelInfo(channelUrl: string): Promise<YtDlpChannelInfo | null> {
    try {
      const aboutUrl = channelUrl.replace(/\/videos\/?$/, '').replace(/\/?$/, '') + '/about';
      const result = await $`yt-dlp -j --skip-download --extractor-args "youtube:player_client=default" ${aboutUrl}`.text();
      const info = JSON.parse(result.trim()) as Record<string, unknown>;
      const resolvedUrl = (info.channel_url as string) || (info.uploader_url as string) || channelUrl;
      return {
        description: info.description as string | undefined,
        thumbnail: info.thumbnail as string | undefined,
        channel_url: resolvedUrl,
        uploader_url: (info.uploader_url as string) || resolvedUrl,
        channel: info.channel as string | undefined,
        uploader: info.uploader as string | undefined,
        title: info.title as string | undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to extract channel info from ${channelUrl}: ${error}`);
      return null;
    }
  }

  async extractYoutubeLiked(cookiesContent: string): Promise<YtDlpTrackInfo[]> {
    let cookiesFile: string | null = null;
    try {
      const { writeFile } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      cookiesFile = join(tmpdir(), `youtube-cookies-${Date.now()}.txt`);
      await writeFile(cookiesFile, cookiesContent, 'utf-8');
      const result = await $`yt-dlp -j --flat-playlist --cookies ${cookiesFile} --extractor-args "youtube:player_client=default" :ytfav`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      handleYtDlpError(error, 'extract YouTube liked videos', this.logger);
      return [];
    } finally {
      if (cookiesFile) await deleteCookiesFile(cookiesFile, this.logger);
    }
  }

  async extractSoundCloudLiked(username: string, oauthToken: string): Promise<YtDlpTrackInfo[]> {
    let cookiesFile: string | null = null;
    try {
      cookiesFile = await generateCookiesFile('soundcloud.com', oauthToken);
      const result = await $`yt-dlp -j --flat-playlist --cookies ${cookiesFile} https://soundcloud.com/${username}/likes`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      handleYtDlpError(error, 'extract SoundCloud liked tracks', this.logger);
      return [];
    } finally {
      if (cookiesFile) await deleteCookiesFile(cookiesFile, this.logger);
    }
  }

  async extractSoundCloudFollowing(username: string, oauthToken: string): Promise<string[]> {
    let cookiesFile: string | null = null;
    try {
      cookiesFile = await generateCookiesFile('soundcloud.com', oauthToken);
      const result = await $`yt-dlp -j --flat-playlist --cookies ${cookiesFile} https://soundcloud.com/${username}/following`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      const artists = lines.map((line) => JSON.parse(line));
      return artists.map((a: YtDlpTrackInfo) => a.url || a.webpage_url).filter(Boolean);
    } catch (error) {
      handleYtDlpError(error, 'extract SoundCloud following', this.logger);
      return [];
    } finally {
      if (cookiesFile) await deleteCookiesFile(cookiesFile, this.logger);
    }
  }

  async extractSoundCloudArtistTracks(artistUrl: string, oauthToken: string): Promise<YtDlpTrackInfo[]> {
    let cookiesFile: string | null = null;
    try {
      cookiesFile = await generateCookiesFile('soundcloud.com', oauthToken);
      const result = await $`yt-dlp -j --flat-playlist --cookies ${cookiesFile} ${artistUrl}/tracks`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      handleYtDlpError(error, `extract tracks from ${artistUrl}`, this.logger);
      return [];
    } finally {
      if (cookiesFile) await deleteCookiesFile(cookiesFile, this.logger);
    }
  }

  async downloadAudio(url: string): Promise<string> {
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const outputPath = join(tmpdir(), `yt-audio-${Date.now()}.m4a`);
    try {
      await $`yt-dlp -f bestaudio[ext=m4a]/bestaudio -o ${outputPath} --extractor-args "youtube:player_client=default" ${url}`;
      return outputPath;
    } catch (error) {
      this.logger.error(`Failed to download audio: ${error}`);
      throw new Error('Failed to download audio from YouTube');
    }
  }

  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      unlinkSync(filePath);
    } catch (error) {
      this.logger.error(`Failed to cleanup temp file: ${error}`);
    }
  }
}
