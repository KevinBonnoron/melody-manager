import type { TranscodeFormat } from '@melody-manager/shared';
import type { Context } from 'hono';
import { databaseServiceFactory } from '../factories';
import { trackRepository } from '../repositories';
import { handleBandcampStream, handleLocalFileStream, handleSoundCloudStream, handleSpotifyStream } from '../stream-handlers';
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

    const provider = track.expand.provider;

    if (provider.type === 'local') {
      const filePath = track.sourceUrl.replace('file://', '');
      const options = { sourceUrl: filePath, transcodeFormat };
      return handleLocalFileStream(c, options);
    }

    if (provider.type === 'bandcamp') {
      const options = {
        sourceUrl: track.sourceUrl,
        cookies: provider.config.cookies,
      };
      return handleBandcampStream(c, options);
    }

    if (provider.type === 'spotify') {
      const options = { sourceUrl: track.sourceUrl, transcodeFormat };
      return handleSpotifyStream(c, options);
    }

    if (provider.type === 'soundcloud') {
      return handleSoundCloudStream(c, { sourceUrl: track.sourceUrl });
    }

    return c.json({ error: 'Unsupported provider type' }, 400);
  },
});
