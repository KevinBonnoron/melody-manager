import type { PluginStreamDeps, StreamOptions } from '@melody-manager/plugin-sdk';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';

async function getValidStreamUrl(ytDlpService: PluginStreamDeps['ytDlpService'], sourceUrl: string): Promise<string> {
  const streamUrl = await ytDlpService.getStreamUrl(sourceUrl);
  const probe = await fetch(streamUrl, { method: 'HEAD' });
  if (probe.ok) {
    return streamUrl;
  }
  console.warn(`[YouTube] Cached stream URL expired for ${sourceUrl}, re-extracting`);
  ytDlpService.invalidateStreamUrl(sourceUrl);
  return ytDlpService.getStreamUrl(sourceUrl);
}

export async function handleYouTubeStream(c: Context, options: StreamOptions, deps: PluginStreamDeps): Promise<Response> {
  const { cacheService, ffmpeg, transcodeService, ytDlpService } = deps;
  const { sourceUrl, trackId, transcodeFormat, startTime, endTime } = options;
  const streamUrl = await getValidStreamUrl(ytDlpService, sourceUrl);

  const cacheKey = trackId ? `track-${trackId}` : sourceUrl;
  const cached = await cacheService.getCached(cacheKey);
  const hasTimeRange = startTime !== undefined || endTime !== undefined;

  if (hasTimeRange && !cached && !cacheService.isDownloadInProgress(cacheKey)) {
    cacheService.extractAndCache(streamUrl, cacheKey, startTime, endTime).catch((error) => {
      console.error(`[YouTube] Background extraction failed: ${error}`);
    });
  }

  if (transcodeFormat) {
    const config = transcodeService.getConfig(transcodeFormat);
    if (config) {
      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'none');
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

      if (cached) {
        return stream(c, async (s) => {
          const proc = transcodeService.transcodeFromFile(cached.path, transcodeFormat);
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

      return stream(c, async (s) => {
        const proc = transcodeService.transcodeFromUrl(streamUrl, transcodeFormat, startTime, endTime);
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

  if (hasTimeRange && !cached) {
    c.header('Content-Type', 'audio/aac');
    c.header('Accept-Ranges', 'none');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

    return stream(c, async (s) => {
      let cmd = ffmpeg();
      if (startTime !== undefined && startTime > 0) {
        cmd = cmd.seekInput(startTime);
      }
      cmd = cmd.input(streamUrl);
      if (endTime !== undefined) {
        const duration = startTime !== undefined ? endTime - startTime : endTime;
        cmd = cmd.duration(duration);
      }
      cmd = cmd.codec({ type: 'copy' }).format('adts').output('-');
      const proc = cmd.spawn();
      proc.stdout.on('data', (chunk) => s.write(chunk));
      proc.stderr.on('data', (data) => {
        const line = data.toString();
        if (line.includes('error') || line.includes('Error')) {
          console.error(`[FFmpeg stderr] ${line}`);
        }
      });
      proc.on('error', (error) => console.error(`[FFmpeg process error] ${error}`));
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
      });
    });
  }

  if (cached) {
    const fileSize = cacheService.getCachedFileSize(cached.path);
    const cachedPath = cached.path;
    const contentType = cachedPath.endsWith('.m4a') || cachedPath.endsWith('.mp4') ? 'audio/mp4' : 'audio/mpeg';
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

  const rangeHeader = c.req.header('Range');
  const fetchHeaders: Record<string, string> = {};
  if (rangeHeader) fetchHeaders.Range = rangeHeader;

  const response = await fetch(streamUrl, { headers: fetchHeaders });
  if (!response.ok) {
    throw new Error('Failed to fetch stream from source');
  }

  if (response.status === 206) {
    c.status(206);
  }
  const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
  c.header('Content-Type', contentType);
  const contentLength = response.headers.get('Content-Length');
  if (contentLength) c.header('Content-Length', contentLength);
  const contentRange = response.headers.get('Content-Range');
  if (contentRange) c.header('Content-Range', contentRange);
  c.header('Accept-Ranges', 'bytes');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');

  return stream(c, async (s) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
}
