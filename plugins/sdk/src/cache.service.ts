import { LRUCache } from 'lru-cache';
import crypto from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { ILogger } from './logger';
import { ffmpeg } from './ffmpeg';

export interface CacheEntry {
  path: string;
  size: number;
}

export interface CacheServiceOptions {
  dir: string;
  maxFiles: number;
  maxSize: number;
}

const noop = () => {};

export class CacheService {
  private readonly options: CacheServiceOptions;
  private readonly log: ILogger;
  private readonly pendingDownloads = new Map<string, Promise<string>>();
  private readonly cache: LRUCache<string, CacheEntry>;

  constructor(options: CacheServiceOptions, logger?: ILogger) {
    this.options = options;
    this.log = logger ?? { debug: noop, error: noop, info: noop, warn: noop, child: () => this.log };

    this.cache = new LRUCache<string, CacheEntry>({
      max: options.maxFiles,
      maxSize: options.maxSize,
      sizeCalculation: (entry) => entry.size,
      ttl: 7 * 24 * 60 * 60 * 1000,
      updateAgeOnGet: true,
      dispose: (entry, key) => {
        if (entry && existsSync(entry.path)) {
          try {
            unlinkSync(entry.path);
            this.log.debug(`[Cache] Evicted ${key} (${entry.size} bytes)`);
          } catch (error) {
            this.log.error(`[Cache] Failed to delete ${entry.path}: ${error}`);
          }
        }
      },
    });

    if (!existsSync(options.dir)) {
      mkdirSync(options.dir, { recursive: true });
    }

    this.loadExistingCache();
  }

  async getCached(sourceUrl: string): Promise<CacheEntry | null> {
    const key = this.getCacheKey(sourceUrl);
    const entry = this.cache.get(key);

    if (entry && existsSync(entry.path)) {
      return entry;
    }

    if (entry) {
      this.cache.delete(key);
    }

    return null;
  }

  isDownloadInProgress(sourceUrl: string): boolean {
    const key = this.getCacheKey(sourceUrl);
    return this.pendingDownloads.has(key);
  }

  async downloadToCache(url: string, sourceUrl: string): Promise<string> {
    const key = this.getCacheKey(sourceUrl);
    const cachePath = this.getCachePath(key);

    const existing = this.cache.get(key);
    if (existing && existsSync(existing.path)) {
      this.log.debug(`[Cache] Hit for ${sourceUrl}`);
      return existing.path;
    }

    const pending = this.pendingDownloads.get(key);
    if (pending) {
      this.log.debug(`[Cache] Download already in progress for ${sourceUrl}, waiting...`);
      return pending;
    }

    this.log.debug(`[Cache] Miss for ${sourceUrl}, downloading...`);

    const downloadPromise = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch stream from source');
        }

        const writeStream = createWriteStream(cachePath);
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const contentLength = response.headers.get('Content-Length');
        const totalSize = contentLength ? Number.parseInt(contentLength, 10) : 0;
        let downloadedSize = 0;
        let lastLoggedPercent = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writeStream.write(value);

            if (value) {
              downloadedSize += value.length;
              if (totalSize > 0) {
                const percent = Math.floor((downloadedSize / totalSize) * 100);
                if (percent >= lastLoggedPercent + 10) {
                  this.log.debug(`[Cache] Download progress for ${sourceUrl}: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                  lastLoggedPercent = percent;
                }
              }
            }
          }

          await new Promise<void>((resolve, reject) => {
            writeStream.end(() => resolve());
            writeStream.on('error', reject);
          });

          const stat = statSync(cachePath);
          this.cache.set(key, { path: cachePath, size: stat.size });

          this.log.debug(`[Cache] Downloaded ${stat.size} bytes to cache`);

          return cachePath;
        } catch (error) {
          reader.releaseLock();
          if (existsSync(cachePath)) {
            unlinkSync(cachePath);
          }
          throw error;
        }
      } finally {
        this.pendingDownloads.delete(key);
      }
    })();

    this.pendingDownloads.set(key, downloadPromise);
    return downloadPromise;
  }

  streamFromCache(cachePath: string, start?: number, end?: number): NodeJS.ReadableStream {
    if (start !== undefined && end !== undefined) {
      return createReadStream(cachePath, { start, end });
    }
    return createReadStream(cachePath);
  }

  getCachedFileSize(cachePath: string): number {
    return statSync(cachePath).size;
  }

  async extractAndCache(url: string, cacheKey: string, startTime?: number, endTime?: number): Promise<string> {
    const key = this.getCacheKey(cacheKey);
    const cachePath = this.getCachePath(key, 'm4a');

    const existing = this.cache.get(key);
    if (existing && existsSync(existing.path)) {
      this.log.debug(`[Cache] Hit for ${cacheKey}`);
      return existing.path;
    }

    const pending = this.pendingDownloads.get(key);
    if (pending) {
      this.log.debug(`[Cache] Extraction already in progress for ${cacheKey}, waiting...`);
      return pending;
    }

    this.log.debug(`[Cache] Miss for ${cacheKey}, extracting with FFmpeg...`);

    const extractPromise = (async () => {
      try {
        let cmd = ffmpeg();

        if (startTime !== undefined && startTime > 0) {
          cmd = cmd.seekInput(startTime);
        }

        cmd = cmd.input(url);

        if (endTime !== undefined) {
          const duration = startTime !== undefined ? endTime - startTime : endTime;
          cmd = cmd.duration(duration);
        }

        cmd = cmd.codec({ type: 'copy' }).overwrite().output(cachePath);

        this.log.debug(`[Cache] FFmpeg command: ${cmd.toString()}`);

        let ffmpegStderr = '';
        try {
          await cmd.run({
            onStderr: (data) => {
              ffmpegStderr += data.toString();
            },
          });

          this.log.debug('[Cache] FFmpeg completed successfully');
        } catch (error) {
          this.log.error(`[Cache] FFmpeg failed: ${error instanceof Error ? error.message : String(error)}`);
          this.log.error(`[Cache] FFmpeg stderr output: ${ffmpegStderr}`);
          throw error;
        }

        const stat = statSync(cachePath);
        this.cache.set(key, { path: cachePath, size: stat.size });

        this.log.debug(`[Cache] Extracted ${stat.size} bytes to cache for ${cacheKey}`);

        return cachePath;
      } catch (error) {
        if (existsSync(cachePath)) {
          unlinkSync(cachePath);
        }
        throw error;
      } finally {
        this.pendingDownloads.delete(key);
      }
    })();

    this.pendingDownloads.set(key, extractPromise);
    return extractPromise;
  }

  invalidate(cacheKey: string): void {
    const key = this.getCacheKey(cacheKey);
    const entry = this.cache.get(key);

    if (entry) {
      if (existsSync(entry.path)) {
        try {
          unlinkSync(entry.path);
          this.log.debug(`[Cache] Invalidated ${cacheKey}`);
        } catch (error) {
          this.log.error(`[Cache] Failed to delete ${entry.path}: ${error}`);
        }
      }
      this.cache.delete(key);
    }
  }

  private loadExistingCache(): void {
    try {
      const files = readdirSync(this.options.dir);
      let loadedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith('.m4a')) {
          const filePath = join(this.options.dir, file);
          const stat = statSync(filePath);
          const key = file.replace('.m4a', '');

          this.cache.set(key, { path: filePath, size: stat.size });

          loadedCount++;
          totalSize += stat.size;
        }
      }

      if (loadedCount > 0) {
        this.log.info(`[Cache] Loaded ${loadedCount} existing files (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
      }
    } catch (error) {
      this.log.error(`[Cache] Failed to load existing cache: ${error}`);
    }
  }

  private getCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  private getCachePath(key: string, extension = 'cache'): string {
    return join(this.options.dir, `${key}.${extension}`);
  }
}
