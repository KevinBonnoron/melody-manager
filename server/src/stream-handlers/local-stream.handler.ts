import { stream } from 'hono/streaming';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { transcodeService } from '../services';
import type { StreamHandler } from '../types';

const mimeTypes: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
  mhtml: 'audio/mhtml',
};

export const handleLocalFileStream: StreamHandler = async (c, { sourceUrl, transcodeFormat }) => {
  if (!existsSync(sourceUrl)) {
    return c.json({ error: 'File not found on disk' }, 404);
  }

  const ext = sourceUrl.split('.').pop()?.toLowerCase();

  // Handle transcoding if requested
  if (transcodeFormat) {
    const config = transcodeService.getConfig(transcodeFormat);
    if (config) {
      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'bytes');

      return stream(c, async (stream) => {
        const ffmpeg = transcodeService.transcodeFromFile(sourceUrl, transcodeFormat as any);

        ffmpeg.stdout.on('data', (chunk) => {
          stream.write(chunk);
        });

        ffmpeg.stderr.on('data', () => {});

        return transcodeService.waitForFfmpeg(ffmpeg);
      });
    }
  }

  // Stream without transcoding
  const stat = statSync(sourceUrl);
  const contentType = mimeTypes[ext || ''] || 'audio/mpeg';
  const fileSize = stat.size;

  // Handle Range requests for seeking
  const range = c.req.header('Range');
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0] || '0', 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    c.status(206); // Partial Content
    c.header('Content-Type', contentType);
    c.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    c.header('Content-Length', chunkSize.toString());
    c.header('Accept-Ranges', 'bytes');

    return stream(c, async (stream) => {
      const fileStream = createReadStream(sourceUrl, { start, end });

      for await (const chunk of fileStream) {
        await stream.write(chunk);
      }
    });
  }

  // Normal request without range
  c.header('Content-Type', contentType);
  c.header('Content-Length', fileSize.toString());
  c.header('Accept-Ranges', 'bytes');

  return stream(c, async (stream) => {
    const fileStream = createReadStream(sourceUrl);

    for await (const chunk of fileStream) {
      await stream.write(chunk);
    }
  });
};
