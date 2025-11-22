import type { Track, TranscodeFormat } from '@melody-manager/shared';
import type { Context } from 'hono';
import { pluginRegistry } from '../plugins';
import type { StreamOptions } from '../plugins/types';

class StreamService {
  async streamTrack(c: Context, track: Track, transcodeFormat?: TranscodeFormat): Promise<Response | null> {
    const provider = track.expand.provider;
    const streamProvider = pluginRegistry.getStreamProvider(provider.type);
    if (!streamProvider) {
      return null;
    }

    const options = this.buildStreamOptions(track, provider, transcodeFormat);
    return streamProvider(c, options);
  }

  private buildStreamOptions(track: Track, provider: { type: string; config: Record<string, unknown> }, transcodeFormat?: TranscodeFormat): StreamOptions {
    const base = {
      sourceUrl: track.sourceUrl.replace(/^file:\/\//, ''),
      trackId: track.id,
      transcodeFormat,
      startTime: track.metadata?.startTime as number | undefined,
      endTime: track.metadata?.endTime as number | undefined,
    };

    if (provider.type === 'bandcamp' && provider.config.cookies) {
      return { ...base, sourceUrl: track.sourceUrl, cookies: provider.config.cookies as string };
    }

    if (provider.type === 'local') {
      return { sourceUrl: base.sourceUrl, transcodeFormat: base.transcodeFormat };
    }

    return base;
  }
}

export const streamService = new StreamService();
