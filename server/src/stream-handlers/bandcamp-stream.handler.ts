import { stream } from 'hono/streaming';
import { bandcampSource } from '../sources';
import type { StreamHandler } from '../types';

export const handleBandcampStream: StreamHandler = async (c, { sourceUrl, cookies }) => {
  // Parse Bandcamp URL format: bandcamp://albumUrl/trackName
  const match = sourceUrl.match(/^bandcamp:\/\/([^/]+)\/(.+)$/);
  if (!match || !match[1] || !match[2]) {
    return c.json({ error: 'Invalid Bandcamp URL format' }, 400);
  }

  if (!cookies) {
    return c.json({ error: 'Missing Bandcamp cookies' }, 400);
  }

  const albumUrl = match[1];
  const trackName = match[2];

  const streamUrl = await bandcampSource.getStreamUrl(albumUrl, trackName, cookies);
  if (!streamUrl) {
    return c.json({ error: 'Failed to get Bandcamp stream URL' }, 500);
  }

  // Forward Range header if present for seeking support
  const rangeHeader = c.req.header('Range');
  const fetchHeaders: Record<string, string> = {};
  if (rangeHeader) {
    fetchHeaders.Range = rangeHeader;
  }

  const response = await fetch(streamUrl, { headers: fetchHeaders });
  if (!response.ok) {
    return c.json({ error: 'Failed to fetch stream from Bandcamp' }, 500);
  }

  // Forward status and headers
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

  return stream(c, async (stream) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await stream.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
};
