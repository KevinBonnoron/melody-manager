import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { type TranscodeFormat, transcodeConfigs } from '@melody-manager/shared';
import { ffmpeg } from './ffmpeg';

export class TranscodeService {
  getConfig(format: TranscodeFormat) {
    return transcodeConfigs[format] || null;
  }

  transcodeFromFile(filePath: string, format?: TranscodeFormat, startTime?: number, endTime?: number): ChildProcessWithoutNullStreams {
    const config = format ? transcodeConfigs[format] : transcodeConfigs.mp3;

    let command = ffmpeg();
    if (startTime !== undefined) {
      command = command.seekInput(startTime);
    }

    command = command.input(filePath);
    if (endTime !== undefined) {
      command = command.seekOutput(undefined, endTime);
    }

    command = command.args(...config.ffmpegArgs, 'pipe:1');

    return command.spawn();
  }

  transcodeFromUrl(url: string, format?: TranscodeFormat, startTime?: number, endTime?: number): ChildProcessWithoutNullStreams {
    const config = format ? transcodeConfigs[format] : transcodeConfigs.mp3;

    let command = ffmpeg();
    if (startTime !== undefined) {
      command = command.seekInput(startTime);
    }

    command = command.input(url);
    if (endTime !== undefined) {
      const duration = endTime - (startTime || 0);
      command = command.duration(duration);
    }

    command = command.args(...config.ffmpegArgs, 'pipe:1');

    return command.spawn();
  }

  transcodeFromPipe(pipePath: string, format?: TranscodeFormat): ChildProcessWithoutNullStreams {
    const config = format ? transcodeConfigs[format] : transcodeConfigs.mp3;

    const command = ffmpeg()
      .input(pipePath, ['-f', 's16le', '-ar', '44100', '-ac', '2'])
      .args(...config.ffmpegArgs, 'pipe:1');

    return command.spawn();
  }

  waitForFfmpeg(proc: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }
}
