import { transcodeConfigs } from '@melody-manager/shared';
import { stream } from 'hono/streaming';
import { spawn } from 'node:child_process';
import { ffmpeg } from '@melody-manager/plugin-sdk';
import { logger } from '../lib/logger';
import { cacheService, transcodeService } from '../services';
import type { StreamHandler } from '../types';

export const handleSoundCloudStream: StreamHandler = async (c, { sourceUrl, startTime, endTime }) => {
  const cached = await cacheService.getCached(sourceUrl);
  const config = transcodeService.getConfig('mp3');

  if (!config) {
    return c.json({ error: 'Invalid transcode format' }, 400);
  }

  c.header('Content-Type', config.mimeType);
  c.header('Accept-Ranges', 'none');

  // For time-based seeking, check if file is in cache for better performance
  if (cached) {
    return stream(c, async (stream) => {
      const ffmpeg = transcodeService.transcodeFromFile(cached.path, 'mp3', startTime, endTime);

      let dataReceived = false;
      ffmpeg.stdout.on('data', (chunk) => {
        if (!dataReceived) {
          dataReceived = true;
        }
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

  // No cache: use yt-dlp to download and pipe to ffmpeg (like the working test)
  return stream(c, async (stream) => {
    // Spawn yt-dlp to download and output to stdout
    const ytdlp = spawn('yt-dlp', [
      '-f',
      'bestaudio',
      '-o',
      '-', // Output to stdout
      sourceUrl,
    ]);

    // Build ffmpeg command
    let command = ffmpeg();

    if (startTime !== undefined) {
      command = command.seekInput(startTime);
    }

    command = command.input('pipe:0');

    if (endTime !== undefined) {
      const duration = endTime - (startTime || 0);
      command = command.duration(duration);
    }

    command = command.args(...transcodeConfigs.mp3.ffmpegArgs, 'pipe:1');

    const ffmpegProcess = command.spawn();

    // Pipe yt-dlp output to ffmpeg input
    ytdlp.stdout.pipe(ffmpegProcess.stdin);
    ytdlp.stderr.on('data', () => {}); // Ignore yt-dlp stderr

    let dataReceived = false;
    ffmpegProcess.stdout.on('data', (chunk) => {
      if (!dataReceived) {
        dataReceived = true;
      }
      stream.write(chunk);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const line = data.toString();
      if (line.includes('error') || line.includes('Error')) {
        logger.error(`[FFmpeg stderr] ${line}`);
      }
    });

    ffmpegProcess.on('error', (error) => {
      logger.error(`[FFmpeg process error] ${error}`);
    });

    ytdlp.on('error', (error) => {
      logger.error(`[yt-dlp process error] ${error}`);
    });

    // Wait for both processes
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        ytdlp.on('close', (code) => {
          if (code === 0 || code === null) resolve();
          else reject(new Error(`yt-dlp exited with code ${code}`));
        });
      }),
      transcodeService.waitForFfmpeg(ffmpegProcess),
    ]);
  });
};
