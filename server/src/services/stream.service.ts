import { ffmpeg, type ResolvedStream, TranscodeService } from '@melody-manager/plugin-sdk';
import type { Track, TranscodeFormat } from '@melody-manager/shared';
import { transcodeConfigs } from '@melody-manager/shared';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pluginRegistry } from '../plugins';
import { cacheService } from '../plugins/loader';

const transcodeService = new TranscodeService();

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
};

function mimeTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (filePath.endsWith('.m4a') || filePath.endsWith('.mp4')) {
    return 'audio/mp4';
  }
  return MIME_TYPES[ext] ?? 'audio/mpeg';
}

const CODEC_MIME_MAP: Record<string, string> = {
  aac: 'audio/mp4',
  opus: 'audio/webm',
  vorbis: 'audio/webm',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
};

async function mimeTypeFromProbe(filePath: string): Promise<string> {
  const known = MIME_TYPES[filePath.split('.').pop()?.toLowerCase() ?? ''];
  if (known) {
    return known;
  }
  const codec = await probeAudioCodec(filePath);
  return CODEC_MIME_MAP[codec] ?? 'audio/mpeg';
}

function probeAudioCodec(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'quiet', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', filePath], (error, stdout) => {
      resolve(error ? 'aac' : stdout.trim() || 'aac');
    });
  });
}

async function serveFile(c: Context, filePath: string, transcodeFormat?: TranscodeFormat): Promise<Response> {
  if (!existsSync(filePath)) {
    return c.json({ error: 'File not found on disk' }, 404);
  }

  if (transcodeFormat) {
    const config = transcodeService.getConfig(transcodeFormat);
    if (config) {
      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'none');
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return stream(c, async (s) => {
        const proc = transcodeService.transcodeFromFile(filePath, transcodeFormat);
        proc.stdout.on('data', (chunk) => s.write(chunk));
        proc.stderr.on('data', (data) => {
          const line = data.toString();
          if (line.includes('error') || line.includes('Error')) {
            console.error(`[FFmpeg stderr] ${line}`);
          }
        });
        proc.on('error', (error) => console.error(`[FFmpeg process error] ${error}`));
        await transcodeService.waitForFfmpeg(proc);
      });
    }
  }

  const stat = statSync(filePath);
  const fileSize = stat.size;
  const contentType = mimeTypeFromPath(filePath);
  const range = c.req.header('Range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0] || '0', 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    const validStart = Math.min(start, fileSize - 1);
    const validEnd = Math.min(end, fileSize - 1);
    const chunkSize = validEnd - validStart + 1;

    c.status(206);
    c.header('Content-Type', contentType);
    c.header('Content-Range', `bytes ${validStart}-${validEnd}/${fileSize}`);
    c.header('Content-Length', chunkSize.toString());
    c.header('Accept-Ranges', 'bytes');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return stream(c, async (s) => {
      const fileStream = createReadStream(filePath, { start: validStart, end: validEnd });
      for await (const chunk of fileStream) {
        await s.write(chunk);
      }
    });
  }

  c.header('Content-Type', contentType);
  c.header('Content-Length', fileSize.toString());
  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return stream(c, async (s) => {
    const fileStream = createReadStream(filePath);
    for await (const chunk of fileStream) {
      await s.write(chunk);
    }
  });
}

async function serveFileSegment(c: Context, filePath: string, transcodeFormat?: TranscodeFormat, startTime?: number, endTime?: number): Promise<Response> {
  if (transcodeFormat) {
    const config = transcodeConfigs[transcodeFormat as keyof typeof transcodeConfigs];
    if (config) {
      const tmpPath = `${tmpdir()}/melody-segment-${Date.now()}.${transcodeFormat}`;
      let cmd = ffmpeg();
      if (startTime !== undefined) {
        cmd = cmd.seekInput(startTime);
      }
      cmd = cmd.input(filePath);
      if (endTime !== undefined) {
        cmd = cmd.duration(endTime - (startTime ?? 0));
      }
      cmd = cmd
        .args(...config.ffmpegArgs)
        .overwrite()
        .output(tmpPath);
      await cmd.run();

      return serveTmpFile(c, tmpPath, config.mimeType);
    }
  }

  // Codec copy: near-instant, no re-encoding
  const codecName = await probeAudioCodec(filePath);
  const isOpus = codecName === 'opus' || codecName === 'vorbis';
  const outExt = isOpus ? 'webm' : 'm4a';
  const outMime = isOpus ? 'audio/webm' : 'audio/mp4';

  const tmpPath = `${tmpdir()}/melody-segment-${Date.now()}.${outExt}`;
  let cmd = ffmpeg();
  if (startTime !== undefined) {
    cmd = cmd.seekInput(startTime);
  }
  cmd = cmd.input(filePath);
  if (endTime !== undefined) {
    cmd = cmd.duration(endTime - (startTime ?? 0));
  }
  cmd = cmd.codec({ type: 'copy' }).overwrite().output(tmpPath);
  await cmd.run();

  return serveTmpFile(c, tmpPath, outMime);
}

function serveTmpFile(c: Context, tmpPath: string, contentType: string): Response {
  const stat = statSync(tmpPath);
  c.header('Content-Type', contentType);
  c.header('Content-Length', stat.size.toString());
  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return stream(c, async (s) => {
    const fileStream = createReadStream(tmpPath);
    for await (const chunk of fileStream) {
      await s.write(chunk);
    }
    unlink(tmpPath).catch(() => {});
  });
}

async function serveCached(c: Context, cachedPath: string, transcodeFormat?: TranscodeFormat): Promise<Response> {
  if (transcodeFormat) {
    const config = transcodeService.getConfig(transcodeFormat);
    if (config) {
      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'none');
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return stream(c, async (s) => {
        const proc = transcodeService.transcodeFromFile(cachedPath, transcodeFormat);
        proc.stdout.on('data', (chunk) => s.write(chunk));
        proc.stderr.on('data', (data) => {
          const line = data.toString();
          if (line.includes('error') || line.includes('Error')) {
            console.error(`[FFmpeg stderr] ${line}`);
          }
        });
        proc.on('error', (error) => console.error(`[FFmpeg process error] ${error}`));
        await transcodeService.waitForFfmpeg(proc);
      });
    }
  }

  const fileSize = cacheService.getCachedFileSize(cachedPath);
  const contentType = await mimeTypeFromProbe(cachedPath);
  const range = c.req.header('Range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0] || '0', 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    const validStart = Math.min(start, fileSize - 1);
    const validEnd = Math.min(end, fileSize - 1);
    const chunkSize = validEnd - validStart + 1;

    c.status(206);
    c.header('Content-Type', contentType);
    c.header('Content-Range', `bytes ${validStart}-${validEnd}/${fileSize}`);
    c.header('Content-Length', chunkSize.toString());
    c.header('Accept-Ranges', 'bytes');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return stream(c, async (s) => {
      const fileStream = cacheService.streamFromCache(cachedPath, validStart, validEnd);
      for await (const chunk of fileStream) {
        await s.write(chunk);
      }
    });
  }

  c.header('Content-Type', contentType);
  c.header('Content-Length', fileSize.toString());
  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return stream(c, async (s) => {
    const fileStream = cacheService.streamFromCache(cachedPath);
    for await (const chunk of fileStream) {
      await s.write(chunk);
    }
  });
}

async function proxyUrl(c: Context, streamUrl: string, transcodeFormat?: TranscodeFormat): Promise<Response> {
  if (transcodeFormat) {
    const config = transcodeService.getConfig(transcodeFormat);
    if (config) {
      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'none');
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return stream(c, async (s) => {
        const proc = transcodeService.transcodeFromUrl(streamUrl, transcodeFormat);
        proc.stdout.on('data', (chunk) => s.write(chunk));
        proc.stderr.on('data', (data) => {
          const line = data.toString();
          if (line.includes('error') || line.includes('Error')) {
            console.error(`[FFmpeg stderr] ${line}`);
          }
        });
        proc.on('error', (error) => console.error(`[FFmpeg process error] ${error}`));
        await transcodeService.waitForFfmpeg(proc);
      });
    }
  }

  const rangeHeader = c.req.header('Range');
  const fetchHeaders: Record<string, string> = {};
  if (rangeHeader) {
    fetchHeaders.Range = rangeHeader;
  }

  const response = await fetch(streamUrl, { headers: fetchHeaders });
  if (!response.ok) {
    throw new Error('Failed to fetch stream from source');
  }
  if (response.status === 206) {
    c.status(206);
  }
  c.header('Content-Type', response.headers.get('Content-Type') || 'audio/mpeg');
  const contentLength = response.headers.get('Content-Length');
  if (contentLength) {
    c.header('Content-Length', contentLength);
  }
  const contentRange = response.headers.get('Content-Range');
  if (contentRange) {
    c.header('Content-Range', contentRange);
  }
  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

  return stream(c, async (s) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await s.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
}

async function streamResolved(c: Context, resolved: ResolvedStream, cacheKey: string, transcodeFormat?: TranscodeFormat, startTime?: number, endTime?: number): Promise<Response> {
  if (resolved.type === 'file') {
    return serveFile(c, resolved.path, transcodeFormat);
  }

  const { url: streamUrl, download } = resolved;
  const hasTimeRange = startTime !== undefined || endTime !== undefined;

  // When a download function is provided (e.g. SoundCloud), CDN URLs expire too
  // quickly to proxy. Always download synchronously and serve from cache.
  if (download) {
    if (hasTimeRange) {
      const cachedPath = await cacheService.extractAndCache(streamUrl, cacheKey, startTime, endTime);
      return serveCached(c, cachedPath, transcodeFormat);
    }
    const cachedPath = await cacheService.downloadWithFn(cacheKey, download);
    return serveCached(c, cachedPath, transcodeFormat);
  }

  // For URL-based streams (YouTube, Bandcamp): proxy live, cache in background.
  const cached = await cacheService.getCached(cacheKey);
  if (!cached && !cacheService.isDownloadInProgress(cacheKey)) {
    cacheService.downloadToCache(streamUrl, cacheKey).catch((error) => {
      console.error(`[stream] Background cache failed: ${error}`);
    });
  }

  if (cached) {
    if (hasTimeRange) {
      return serveFileSegment(c, cached.path, transcodeFormat, startTime, endTime);
    }
    return serveCached(c, cached.path, transcodeFormat);
  }

  if (hasTimeRange) {
    const cachedPath = await cacheService.extractAndCache(streamUrl, cacheKey, startTime, endTime);
    return serveCached(c, cachedPath, transcodeFormat);
  }

  return proxyUrl(c, streamUrl, transcodeFormat);
}

class StreamService {
  public async streamTrack(c: Context, track: Track, transcodeFormat?: TranscodeFormat): Promise<Response | null> {
    const startTime = track.metadata?.startTime as number | undefined;
    const endTime = track.metadata?.endTime as number | undefined;

    // Fast path: track already downloaded locally (file is already the extracted segment)
    const localPath = track.metadata?.localPath as string | undefined;
    const hasTimeRange = startTime !== undefined || endTime !== undefined;
    if (localPath && existsSync(localPath)) {
      return serveFile(c, localPath, transcodeFormat);
    }

    const provider = track.expand.provider;
    const resolver = pluginRegistry.getStreamResolver(provider.type);
    if (!resolver) {
      return null;
    }

    const sourceUrl = provider.type === 'local' ? track.sourceUrl.replace(/^file:\/\//, '') : track.sourceUrl;

    const cacheKey = track.id ? `track-${track.id}` : sourceUrl;
    const cached = await cacheService.getCached(cacheKey);

    // Serve from cache before resolving (avoids unnecessary yt-dlp call)
    if (cached && !transcodeFormat) {
      if (hasTimeRange) {
        return serveFileSegment(c, cached.path, transcodeFormat, startTime, endTime);
      }
      return serveCached(c, cached.path, transcodeFormat);
    }

    const resolved = await resolver.resolve(sourceUrl);
    return streamResolved(c, resolved, cacheKey, transcodeFormat, startTime, endTime);
  }
}

export const streamService = new StreamService();
