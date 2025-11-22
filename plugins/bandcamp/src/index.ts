import type { PluginStreamDeps, StreamOptions } from '@melody-manager/plugin-sdk';
import { parseCookies } from '@melody-manager/plugin-sdk';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { BandcampFetch } from 'bandcamp-fetch';

export class BandcampPlugin {
  constructor(_deps: PluginStreamDeps) {}

  async stream(c: Context, options: StreamOptions): Promise<Response> {
    const { sourceUrl, cookies } = options;
    const match = sourceUrl.match(/^bandcamp:\/\/([^/]+)\/(.+)$/);
    if (!match?.[1] || !match[2]) {
      return c.json({ error: 'Invalid Bandcamp URL format' }, 400);
    }
    if (!cookies) {
      return c.json({ error: 'Missing Bandcamp cookies' }, 400);
    }

    const albumUrl = decodeURIComponent(match[1]);
    const trackName = decodeURIComponent(match[2]);
    const cookieHeader = parseCookies(cookies);
    const bcfetch = new BandcampFetch({ cookie: cookieHeader });

    let streamUrl: string | null = null;
    try {
      const itemInfo = await bcfetch.album.getInfo({ albumUrl });
      if (!itemInfo) {
        return c.json({ error: 'No album info found' }, 500);
      }
      if (itemInfo.tracks?.length) {
        const track = itemInfo.tracks.find((t: { name: string }) => t.name === trackName);
        if (track?.streamUrl) streamUrl = track.streamUrl;
      }
      if (!streamUrl && (itemInfo as { streamUrl?: string }).streamUrl) {
        streamUrl = (itemInfo as { streamUrl: string }).streamUrl;
      }
    } catch (error) {
      console.error(`[Bandcamp] Error getting stream URL: ${error}`);
      return c.json({ error: 'Failed to get Bandcamp stream URL' }, 500);
    }

    if (!streamUrl) {
      return c.json({ error: 'No stream URL found for track' }, 500);
    }

    const rangeHeader = c.req.header('Range');
    const fetchHeaders: Record<string, string> = {};
    if (rangeHeader) fetchHeaders.Range = rangeHeader;

    const response = await fetch(streamUrl, { headers: fetchHeaders });
    if (!response.ok) {
      return c.json({ error: 'Failed to fetch stream from Bandcamp' }, 500);
    }

    if (response.status === 206) c.status(206);
    c.header('Content-Type', response.headers.get('Content-Type') ?? 'audio/mpeg');
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) c.header('Content-Length', contentLength);
    const contentRange = response.headers.get('Content-Range');
    if (contentRange) c.header('Content-Range', contentRange);
    c.header('Accept-Ranges', 'bytes');

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
}
