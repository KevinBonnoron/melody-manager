import type { TranscodeFormat } from '@melody-manager/shared';
import type { Context } from 'hono';
import { databaseServiceFactory } from '../factories';
import { trackRepository } from '../repositories';
import { peaksService } from './peaks.service';
import { streamService } from './stream.service';

export const trackService = databaseServiceFactory(trackRepository, {
  async streamTrack(c: Context, trackId: string, transcodeFormat?: TranscodeFormat) {
    const track = await trackRepository.getOne(trackId);
    if (!track) {
      return c.json({ error: 'Track not found' }, 404);
    }

    const pluginResponse = await streamService.streamTrack(c, track, transcodeFormat);
    if (pluginResponse) {
      return pluginResponse;
    }

    return c.json({ error: 'Unsupported provider type' }, 400);
  },

  async getTrackPeaks(trackId: string): Promise<number[]> {
    const track = await trackRepository.getOne(trackId);
    if (!track) {
      return [];
    }
    return peaksService.getTrackPeaks(track);
  },
});
