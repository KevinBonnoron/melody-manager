import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Track } from '@melody-manager/shared';
import { cacheService } from './cache.service';

const NUM_PEAKS = 800;

class PeaksService {
  private readonly peaksCache = new Map<string, number[]>();

  public async getTrackPeaks(track: Track): Promise<number[]> {
    const cached = this.peaksCache.get(track.id);
    if (cached) {
      return cached;
    }

    const audioPath = await this.resolveAudioPath(track);
    if (!audioPath) {
      return [];
    }

    const peaks = await this.computePeaks(audioPath);
    this.peaksCache.set(track.id, peaks);
    return peaks;
  }

  public invalidate(trackId: string): void {
    this.peaksCache.delete(trackId);
  }

  private async resolveAudioPath(track: Track): Promise<string | null> {
    const localPath = track.metadata?.localPath as string | undefined;
    if (localPath && existsSync(localPath)) {
      return localPath;
    }

    if (track.sourceUrl.startsWith('file://')) {
      const filePath = track.sourceUrl.replace(/^file:\/\//, '');
      if (existsSync(filePath)) {
        return filePath;
      }
    }

    const cacheKey = `track-${track.id}`;

    // Poll for up to 15s: the stream endpoint may still be resolving the URL via yt-dlp
    // before it registers a pending download.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const cached = await cacheService.getCached(cacheKey);
      if (cached) {
        return cached.path;
      }
      const pending = cacheService.getPendingDownload(cacheKey);
      if (pending) {
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000));
        return Promise.race([pending, timeout]);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return null;
  }

  private computePeaks(input: string): Promise<number[]> {
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-i', input, '-ac', '1', '-f', 's16le', '-ar', '8000', 'pipe:1']);

      const chunks: Buffer[] = [];
      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      proc.stderr.on('data', () => {});
      proc.on('close', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
          const blockSize = Math.max(1, Math.floor(samples.length / NUM_PEAKS));
          const peaks: number[] = [];

          for (let i = 0; i < NUM_PEAKS; i++) {
            let max = 0;
            const start = i * blockSize;
            const end = Math.min(start + blockSize, samples.length);
            for (let j = start; j < end; j++) {
              const sample = samples[j];
              const val = Math.abs(sample ?? 0) / 32768;
              if (val > max) {
                max = val;
              }
            }
            peaks.push(max);
          }

          resolve(peaks);
        } catch {
          resolve([]);
        }
      });
      proc.on('error', () => resolve([]));
    });
  }
}

export const peaksService = new PeaksService();
