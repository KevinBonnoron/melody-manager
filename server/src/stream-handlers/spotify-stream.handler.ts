import { stream } from 'hono/streaming';
import { createReadStream } from 'node:fs';
import { logger } from '../lib/logger';
import { librespotService, spotifyService, transcodeService } from '../services';
import type { StreamHandler } from '../types';

export const handleSpotifyStream: StreamHandler = async (c, { sourceUrl, transcodeFormat }) => {
  const trackUri = sourceUrl.startsWith('spotify:') ? sourceUrl : `spotify:track:${sourceUrl.split('/').pop()}`;
  if (!librespotService.isRunning()) {
    return c.json({ error: 'Spotify service not available' }, 503);
  }

  const deviceId = librespotService.getDeviceId();
  if (!deviceId) {
    return c.json({ error: 'Spotify device not ready' }, 503);
  }

  try {
    // Start playback via Spotify Web API
    await spotifyService.playTrack(trackUri, deviceId);

    // Wait a bit for audio to start flowing to the pipe
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pipePath = librespotService.getPipePath();

    // If transcoding is needed
    if (transcodeFormat) {
      const config = transcodeService.getConfig(transcodeFormat);
      if (!config) {
        return c.json({ error: 'Invalid transcode format' }, 400);
      }

      c.header('Content-Type', config.mimeType);
      c.header('Accept-Ranges', 'none');

      return stream(c, async (stream) => {
        // Transcode PCM from pipe to desired format
        const ffmpeg = transcodeService.transcodeFromPipe(pipePath, transcodeFormat);

        ffmpeg.stdout.on('data', (chunk) => {
          stream.write(chunk);
        });

        ffmpeg.stderr.on('data', (data) => {
          const line = data.toString();
          if (line.includes('error') || line.includes('Error')) {
            logger.error(`[FFmpeg stderr] ${line}`);
          }
        });

        ffmpeg.on('error', (error) => {
          logger.error(`[FFmpeg process error] ${error}`);
        });

        await transcodeService.waitForFfmpeg(ffmpeg);
      });
    }

    // Stream raw PCM
    c.header('Content-Type', 'audio/pcm');
    c.header('Accept-Ranges', 'none');

    return stream(c, async (stream) => {
      const pipeStream = createReadStream(pipePath);

      pipeStream.on('data', (chunk) => {
        stream.write(chunk);
      });

      pipeStream.on('error', (error) => {
        logger.error(`[Pipe stream error] ${error}`);
      });

      await new Promise<void>((resolve, reject) => {
        pipeStream.on('end', () => resolve());
        pipeStream.on('error', reject);
      });
    });
  } catch (error) {
    logger.error(`[Spotify stream error] ${error}`);
    return c.json({ error: 'Failed to stream from Spotify' }, 500);
  }
};
