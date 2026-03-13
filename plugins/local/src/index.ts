import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ILogger, ImportProvider, PluginImportTrack, PluginStreamDeps, ResolvedStream, WatchEventHandler, WatchProvider } from '@melody-manager/plugin-sdk';
import type { TrackMetadata, TrackProvider } from '@melody-manager/shared';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { parseFile } from 'music-metadata';

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'webm', 'opus', 'wma']);
const COVER_BASENAMES = ['cover', 'folder', 'front', 'album', 'artwork'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function isAudioFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.has(ext);
}

export class LocalPlugin implements ImportProvider, WatchProvider {
  private readonly logger: ILogger;
  private watcher: FSWatcher | null = null;
  private onChange: WatchEventHandler | null = null;
  private readonly coverCache = new Map<string, string | undefined>();

  public constructor(deps: PluginStreamDeps) {
    this.logger = deps.logger;
  }

  public async resolve(sourceUrl: string): Promise<ResolvedStream> {
    return { type: 'file', path: sourceUrl.replace(/^file:\/\//, '') };
  }

  public async getTracks(_url: string, provider: TrackProvider): Promise<PluginImportTrack[]> {
    const dirPath = provider.config.path as string;
    const tracks: PluginImportTrack[] = [];
    await this.scanDirectory(dirPath, tracks);
    return tracks;
  }

  public watch(provider: TrackProvider, onChange: WatchEventHandler): void {
    this.unwatch();
    this.onChange = onChange;

    const dirPath = provider.config.path as string;
    if (!dirPath || !existsSync(dirPath)) {
      return;
    }

    // Initial sync — emit everything on disk
    this.emitSync(dirPath, provider);

    this.watcher = chokidar.watch(dirPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    this.watcher
      .on('add', (filePath) => {
        if (isAudioFile(filePath)) {
          this.emitAdded(filePath);
        }
      })
      .on('addDir', (addedDir) => {
        this.emitAddedDir(addedDir);
      })
      .on('unlink', (filePath) => {
        if (isAudioFile(filePath)) {
          this.onChange?.({ type: 'removed', sourceUrls: [`file://${filePath}`] });
        }
      });
  }

  public unwatch(): void {
    this.watcher?.close();
    this.watcher = null;
    this.onChange = null;
    this.coverCache.clear();
  }

  private async emitSync(_dirPath: string, provider: TrackProvider): Promise<void> {
    try {
      const tracks = await this.getTracks('', provider);
      tracks.sort((a, b) => (a.metadata?.trackNumber ?? 0) - (b.metadata?.trackNumber ?? 0));
      this.logger.info(`[local] Sync: ${tracks.length} tracks on disk`);
      this.onChange?.({ type: 'sync', tracks });
    } catch (error) {
      this.logger.error('[local] Sync failed', error);
    }
  }

  private async emitAdded(filePath: string): Promise<void> {
    try {
      const track = await this.extractTrack(filePath);
      if (track) {
        this.onChange?.({ type: 'added', tracks: [track] });
      }
    } catch (error) {
      this.logger.error('[local] Add failed', error);
    }
  }

  private async emitAddedDir(dirPath: string): Promise<void> {
    try {
      const tracks: PluginImportTrack[] = [];
      await this.scanDirectory(dirPath, tracks);
      if (tracks.length > 0) {
        tracks.sort((a, b) => (a.metadata?.trackNumber ?? 0) - (b.metadata?.trackNumber ?? 0));
        this.logger.info(`[local] Directory added: ${dirPath} (${tracks.length} tracks)`);
        this.onChange?.({ type: 'added', tracks });
      }
    } catch (error) {
      this.logger.error('[local] Dir add failed', error);
    }
  }

  private async scanDirectory(dirPath: string, tracks: PluginImportTrack[]): Promise<void> {
    const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, tracks);
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        const track = await this.extractTrack(fullPath);
        if (track) {
          tracks.push(track);
        }
      }
    }
  }

  private findLocalCoverArt(dirPath: string): string | undefined {
    if (this.coverCache.has(dirPath)) {
      return this.coverCache.get(dirPath);
    }

    try {
      const entries = readdirSync(dirPath);
      const lowered = entries.map((name) => name.toLowerCase());

      for (const baseName of COVER_BASENAMES) {
        for (const ext of IMAGE_EXTENSIONS) {
          const target = `${baseName}.${ext}`;
          const idx = lowered.indexOf(target);
          if (idx === -1) {
            continue;
          }
          const fullPath = join(dirPath, entries[idx] as string);
          const buf = readFileSync(fullPath);
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const result = `data:${mime};base64,${buf.toString('base64')}`;
          this.coverCache.set(dirPath, result);
          return result;
        }
      }
    } catch {
      // directory read failed, ignore
    }

    this.coverCache.set(dirPath, undefined);
    return undefined;
  }

  private async extractTrack(filePath: string): Promise<PluginImportTrack | null> {
    try {
      const meta = await parseFile(filePath);
      const artists = meta.common.artist ? meta.common.artist.split(/;|&|feat\.|ft\.|and/).map((a) => a.trim()) : [];
      if (meta.common.albumartist && !artists.includes(meta.common.albumartist)) {
        artists.unshift(meta.common.albumartist);
      }

      const title = meta.common.title;
      const duration = meta.format.duration;
      const album = meta.common.album;

      if (!title || !duration || !album) {
        return null;
      }

      const genres = (meta.common.genre ?? [])
        .flatMap((g) => g.split(/;|\//))
        .flatMap((g) =>
          g
            .trim()
            .split(/(?=[A-Z][a-z])/)
            .filter((s) => s.length > 0)
            .map((s) => s.trim())
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1)),
        )
        .filter((g, i, self) => self.indexOf(g) === i);

      let coverArtUrl: string | undefined;
      if (meta.common.picture?.length) {
        const pic = meta.common.picture[0];
        if (pic) {
          coverArtUrl = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
        }
      }
      if (!coverArtUrl) {
        coverArtUrl = this.findLocalCoverArt(dirname(filePath));
      }

      const format = meta.format.container?.toLowerCase();
      const metadata: TrackMetadata = {
        year: meta.common.year,
        bitrate: meta.format.bitrate,
        format,
        coverArtUrl,
        trackNumber: meta.common.track.no ?? undefined,
        totalTracks: meta.common.track.of ?? undefined,
        discNumber: meta.common.disk.no ?? undefined,
      };

      return {
        title,
        duration: Math.floor(duration),
        sourceUrl: `file://${filePath}`,
        artistName: artists[0] ?? 'Unknown Artist',
        albumName: album,
        coverUrl: coverArtUrl,
        metadata,
        genreNames: genres.length > 0 ? genres : undefined,
      };
    } catch {
      return null;
    }
  }
}
