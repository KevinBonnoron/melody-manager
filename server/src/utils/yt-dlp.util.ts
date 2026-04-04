import { unlinkSync } from 'node:fs';
import type { ResolvedTrack, TrackMetadata } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import { $ } from 'bun';
import { LRUCache } from 'lru-cache';
import { logger } from '../lib/logger';
import type { YtDlpChapter, YtDlpTrackInfo } from '../types/yt-dlp.type';

export type { YtDlpChapter, YtDlpComment, YtDlpTrackInfo } from '../types/yt-dlp.type';

interface StreamInfo {
  url: string;
}

// --- Module-level caches ---

const streamInfoCache = new LRUCache<string, StreamInfo>({
  max: 1000,
  ttl: 4 * 60 * 60 * 1000,
});

const trackInfoCache = new LRUCache<string, YtDlpTrackInfo>({
  max: 200,
  ttl: 5 * 60 * 1000,
});

// --- Internal helpers ---

function cookiesArgs(cookiesFile?: string): string[] {
  return cookiesFile ? ['--cookies', cookiesFile] : [];
}

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

export function parseChaptersFromText(text: string, duration: number): YtDlpChapter[] {
  const chapters: YtDlpChapter[] = [];
  const rawLines = text.split('\n').filter((line) => line.trim() !== '');
  const trim = (str: string) => str.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');

  // Pattern: "NN. Title TIMESTAMP" or "Title TIMESTAMP" (timestamp at end of line)
  const trailingTimestampPattern = /^(?:\d+[.)]\s*)?(.+?)\s*?(\d+:\d{2}(?::\d{2})?)$/;

  // Patterns: "NN. Title: TIMESTAMP" or "Title: TIMESTAMP" (colon separator)
  const titlePatterns = [/^\d+\.\s+(.+?):\s+(\d+:\d{2}(?::\d{2})?)$/, /^(.+?):\s+(\d+:\d{2}(?::\d{2})?)$/];

  // Patterns: "TIMESTAMP - Title", "[TIMESTAMP] Title", "TIMESTAMP Title" (timestamp first)
  const timestampPatterns = [/^(\d+:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+)$/, /^\[?(\d+:\d{2}(?::\d{2})?)\]?\s*[-–—]?\s*(.+)$/, /^(\d+:\d{2}(?::\d{2})?)\s+(.+)$/];

  for (const rawLine of rawLines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      continue;
    }

    // 1. Try "Title: TIMESTAMP" patterns on the full line first
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

    if (matched) {
      continue;
    }

    // 2. Try "NN. Title TIMESTAMP" trailing timestamp pattern
    const trailingMatch = trimmedLine.match(trailingTimestampPattern);
    if (trailingMatch?.[1] && trailingMatch[2]) {
      const title = trim(trailingMatch[1]);
      const startTime = parseTimeToSeconds(trailingMatch[2]);
      if (title && startTime !== null) {
        chapters.push({ title, start_time: startTime, end_time: 0 });
        continue;
      }
    }

    // 3. Split line on timestamp boundaries for "TIMESTAMP Title" formats
    const fragments = trimmedLine.split(/(?<![\d:])(?=\d+:\d{2}(?::\d{2})?)/).filter((f) => f.trim() !== '');

    for (const fragment of fragments) {
      const trimmedFragment = fragment.trim();
      if (!trimmedFragment) {
        continue;
      }

      for (const pattern of timestampPatterns) {
        const match = trimmedFragment.match(pattern);
        if (match?.[1] && match[2]) {
          let title = trim(match[2]);
          const trackNumberMatch = title.match(/^(\d+)[\s\u3000]+(.+)$/);
          if (trackNumberMatch?.[2]) {
            title = trim(trackNumberMatch[2]);
          }

          const startTime = parseTimeToSeconds(match[1]);
          if (title && startTime !== null) {
            chapters.push({ title, start_time: startTime, end_time: 0 });
          }

          break;
        }
      }
    }
  }

  if (chapters.length === 0) {
    return [];
  }

  chapters.sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (!chapter) {
      continue;
    }

    const nextChapter = chapters[i + 1];
    chapter.end_time = nextChapter ? nextChapter.start_time : duration;
    const chapterDuration = chapter.end_time - chapter.start_time;
    if (chapterDuration <= 0) {
      chapter.end_time = chapter.start_time + 1;
      if (nextChapter && nextChapter.start_time === chapter.start_time) {
        nextChapter.start_time = chapter.end_time;
      }
    }
  }

  return chapters;
}

function handleYtDlpError(error: unknown, context: string): void {
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
    if (firstLine) {
      logger.error(`yt-dlp error: ${firstLine.trim()}`);
    }
  } else {
    logger.error(`${errorMessage} ${error}`);
  }
}

function pickBestChapters(descChapters: YtDlpChapter[], commentChapters: YtDlpChapter[], duration: number): YtDlpChapter[] {
  if (descChapters.length === 0) {
    return commentChapters;
  }

  if (commentChapters.length === 0) {
    return descChapters;
  }

  const descCoverage = Math.min(1, (descChapters[descChapters.length - 1]?.end_time ?? 0) / duration);
  const commentCoverage = Math.min(1, (commentChapters[commentChapters.length - 1]?.end_time ?? 0) / duration);

  if (commentChapters.length > descChapters.length) {
    return commentChapters;
  }

  if (descChapters.length > commentChapters.length) {
    return descChapters;
  }

  return commentCoverage >= descCoverage ? commentChapters : descChapters;
}

// --- Public API ---

export async function getStreamUrl(sourceUrl: string, cookiesFile?: string): Promise<string> {
  const cached = streamInfoCache.get(sourceUrl);
  if (cached) {
    return cached.url;
  }

  try {
    const isYouTube = sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be');
    const isSoundCloud = sourceUrl.includes('soundcloud.com');
    let formatSelector = 'bestaudio';
    if (isYouTube) {
      formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';
    } else if (!isSoundCloud) {
      formatSelector = 'bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]/bestaudio';
    }

    const cookies = cookiesArgs(cookiesFile);
    const result = await $`yt-dlp -f ${formatSelector} -g ${cookies} ${sourceUrl}`.text();
    const streamUrl = result.trim();
    streamInfoCache.set(sourceUrl, { url: streamUrl });
    return streamUrl;
  } catch (error) {
    handleYtDlpError(error, 'extract stream URL');
    throw new Error('Failed to extract stream URL');
  }
}

export function invalidateStreamUrl(sourceUrl: string): void {
  streamInfoCache.delete(sourceUrl);
}

export async function getValidStreamUrl(sourceUrl: string): Promise<string> {
  const streamUrl = await getStreamUrl(sourceUrl);
  const probe = await fetch(streamUrl, { method: 'HEAD' });
  if (probe.ok) {
    return streamUrl;
  }

  invalidateStreamUrl(sourceUrl);
  return getStreamUrl(sourceUrl);
}

export async function extractTrackInfo(url: string, options?: { withComments?: boolean; cookiesFile?: string }): Promise<YtDlpTrackInfo | null> {
  const cacheKey = options?.withComments ? `${url}#comments` : url;
  const cached = trackInfoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cookies = cookiesArgs(options?.cookiesFile);
  try {
    const info: YtDlpTrackInfo = await $`yt-dlp -j --no-playlist ${cookies} --extractor-args "youtube:player_client=default" ${url}`.json();

    const cleanTitle = (title: string): string => {
      const trim = (str: string) => str.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
      let cleaned = trim(title);
      const trackNumberMatch = cleaned.match(/^(\d+)[\s\u3000.]+(.+)$/);
      if (trackNumberMatch?.[2]) {
        cleaned = trim(trackNumberMatch[2]);
      }

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

    const hasUselessTitles = info.chapters && info.chapters.length > 1 && info.chapters.every((ch) => /^\d+[.)]*\s*$/.test(ch.title.trim()));

    if (!info.chapters || info.chapters.length <= 1 || hasIncompleteChapters || hasUselessTitles) {
      let descChapters: YtDlpChapter[] = [];
      if (info.description && info.duration) {
        const fromDesc = parseChaptersFromText(info.description, info.duration);
        if (fromDesc.length > 1) {
          descChapters = fromDesc;
        }
      }

      let commentChapters: YtDlpChapter[] = [];
      if (options?.withComments && info.duration) {
        try {
          const infoWithComments: YtDlpTrackInfo = await $`yt-dlp -j --no-playlist --write-comments ${cookies} --extractor-args "youtube:player_client=default" ${url}`.json();
          const totalComments = infoWithComments.comments?.length ?? 0;
          if (infoWithComments.comments && totalComments > 0) {
            const rootComments = infoWithComments.comments.filter((c) => c.parent === 'root');
            let best: { chapters: YtDlpChapter[] } | null = null;
            for (const comment of rootComments) {
              const chaptersFromComment = parseChaptersFromText(comment.text, info.duration);
              if (chaptersFromComment.length <= 1) {
                continue;
              }

              const lastEnd = chaptersFromComment[chaptersFromComment.length - 1]?.end_time ?? 0;
              const coverage = Math.min(1, lastEnd / info.duration);
              const bestLastEnd = best ? (best.chapters[best.chapters.length - 1]?.end_time ?? 0) : 0;
              const bestCoverage = Math.min(1, bestLastEnd / info.duration);
              if (!best || chaptersFromComment.length > best.chapters.length || (chaptersFromComment.length === best.chapters.length && coverage > bestCoverage)) {
                best = { chapters: chaptersFromComment };
              }
            }

            if (best) {
              commentChapters = best.chapters;
            }
          }
        } catch (commentError) {
          logger.warn(`[yt-dlp] Failed to fetch comments for ${url}: ${commentError}`);
        }
      }

      const bestChapters = pickBestChapters(descChapters, commentChapters, info.duration);
      if (bestChapters.length > 0) {
        info.chapters = bestChapters;
      }
    }

    if (info.chapters?.length) {
      for (const chapter of info.chapters) {
        chapter.title = cleanTitle(chapter.title);
      }
    }

    trackInfoCache.set(cacheKey, info);
    return info;
  } catch (error) {
    logger.error(`Failed to extract track info: ${error}`);
    return null;
  }
}

export async function extractPlaylistTracks(playlistUrl: string, cookiesFile?: string): Promise<YtDlpTrackInfo[]> {
  try {
    const cookies = cookiesArgs(cookiesFile);
    const result = await $`yt-dlp -j --flat-playlist ${cookies} --extractor-args "youtube:player_client=default" ${playlistUrl}`.text();
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
    handleYtDlpError(error, 'extract playlist tracks');
    return [];
  }
}

export async function downloadAudio(url: string): Promise<string> {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const outputPath = join(tmpdir(), `yt-audio-${Date.now()}.%(ext)s`);
  try {
    const formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[protocol!=m3u8][protocol!=m3u8_native][protocol!=http_dash_segments]/bestaudio';
    const result = await $`yt-dlp -f ${formatSelector} -o ${outputPath} --extractor-args "youtube:player_client=default" --print after_move:filepath ${url}`.text();
    const filepath = result.trim().split('\n').pop();
    if (!filepath) {
      throw new Error('yt-dlp did not return a file path');
    }

    return filepath;
  } catch (error) {
    logger.error(`Failed to download audio: ${error}`);
    throw new Error('Failed to download audio from YouTube');
  }
}

export function cleanupTempFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    logger.error(`Failed to cleanup temp file: ${error}`);
  }
}

// --- Track building helpers (used by providers) ---

export function buildSingleTrack(trackInfo: YtDlpTrackInfo, providerName: string): ResolvedTrack {
  const artistName = trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel ?? 'Unknown Artist';
  const albumName = trackInfo.album ?? `${trackInfo.channel ?? trackInfo.uploader} - ${providerName}`;
  const thumbnail = trackInfo.thumbnail?.startsWith('data:') ? undefined : trackInfo.thumbnail;
  return {
    title: trackInfo.title,
    duration: Math.floor(trackInfo.duration),
    sourceUrl: trackInfo.webpage_url,
    artistName,
    albumName,
    coverUrl: thumbnail,
    metadata: buildMetadata(trackInfo, thumbnail),
  };
}

export function buildMetadata(trackInfo: YtDlpTrackInfo, thumbnail?: string): TrackMetadata {
  return {
    year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
    bitrate: trackInfo.tbr,
    format: trackInfo.ext,
    coverArtUrl: thumbnail,
  };
}
