import type { YtDlpChapter } from '@melody-manager/plugin-sdk';
import { YtDlpService } from '@melody-manager/plugin-sdk';
import type { Track, TrackProvider } from '@melody-manager/shared';
import { existsSync } from 'node:fs';
import { AlbumError } from '../errors';
import { databaseServiceFactory } from '../factories';
import { logger } from '../lib/logger';
import { pluginRegistry } from '../plugins';
import { albumRepository, providerRepository, trackRepository } from '../repositories';
import { detectAllSilenceRegions } from '../utils';
import { taskService } from './task.service';

export const albumService = databaseServiceFactory(albumRepository, {
  async download(albumId: string) {
    const tracks = await trackRepository.getAllBy(`album = "${albumId}"`);
    if (tracks.length === 0) {
      throw new AlbumError('No tracks found for this album', 404);
    }

    const firstTrack = tracks[0];
    if (!firstTrack) {
      throw new AlbumError('No tracks found for this album', 404);
    }

    const provider = (await providerRepository.getOne(firstTrack.provider)) as TrackProvider | null;
    if (!provider) {
      throw new AlbumError('Provider not found', 404);
    }

    const downloadPlugin = pluginRegistry.getDownloadProvider(provider.type);
    if (!downloadPlugin) {
      throw new AlbumError(`Provider ${provider.type} does not support downloading`, 400);
    }

    if (!provider.config.downloadPath) {
      throw new AlbumError('downloadPath is not configured for this provider', 400);
    }

    const albumName = firstTrack.expand.album?.name ?? 'Unknown Album';
    const task = taskService.create('download', albumName);

    // Run async — return task immediately
    (async () => {
      try {
        taskService.update(task.id, { status: 'running' });

        // Clean stale localPath entries before downloading
        for (const track of tracks) {
          const localPath = track.metadata?.localPath as string | undefined;
          if (localPath && !existsSync(localPath)) {
            await trackRepository.update(track.id, {
              metadata: { ...track.metadata, localPath: undefined },
            });
          }
        }

        const downloadTracks = tracks.map((track, index) => ({
          sourceUrl: track.sourceUrl,
          title: track.title,
          trackNumber: index + 1,
          startTime: track.metadata?.startTime as number | undefined,
          endTime: track.metadata?.endTime as number | undefined,
          albumName,
          artistName: firstTrack.expand.artists?.[0]?.name ?? 'Unknown Artist',
        }));

        taskService.update(task.id, { status: 'running', progress: 10 });
        const results = await downloadPlugin.downloadAlbumTracks(downloadTracks, provider);

        taskService.update(task.id, { status: 'running', progress: 90 });
        for (const result of results) {
          const track = tracks.find((t) => t.sourceUrl === result.sourceUrl && (t.metadata?.startTime as number | undefined) === result.startTime);
          if (track) {
            await trackRepository.update(track.id, {
              metadata: { ...track.metadata, localPath: result.localPath },
            });
          }
        }

        taskService.update(task.id, { status: 'completed', progress: 100 });
      } catch (error) {
        logger.error(`Error downloading album: ${error}`);
        taskService.update(task.id, { status: 'failed' });
      }
    })();

    return task;
  },

  async resync(albumId: string) {
    const tracks = await trackRepository.getAllBy(`album = "${albumId}"`);
    if (tracks.length === 0) {
      throw new AlbumError('No tracks found for this album', 404);
    }

    const sorted = [...tracks].sort((a, b) => ((a.metadata?.startTime as number) ?? 0) - ((b.metadata?.startTime as number) ?? 0));
    const firstSorted = sorted[0];
    if (!firstSorted) {
      throw new AlbumError('No tracks found for this album', 404);
    }
    const sourceUrl = firstSorted.sourceUrl;

    if (!sourceUrl.includes('youtube.com') && !sourceUrl.includes('youtu.be')) {
      throw new AlbumError('Resync is only supported for YouTube albums', 400);
    }

    const albumName = firstSorted.expand.album?.name ?? 'Unknown Album';
    const task = taskService.create('resync', albumName);

    // Run async — return task immediately
    (async () => {
      const ytDlp = new YtDlpService(logger);
      try {
        taskService.update(task.id, { status: 'running' });

        // Step 1: Re-fetch chapter timestamps from YouTube
        taskService.update(task.id, { status: 'running', progress: 10 });
        const info = await ytDlp.extractTrackInfo(sourceUrl, { withComments: true });
        const chapters = info?.chapters;
        if (!chapters || chapters.length === 0) {
          throw new Error('No chapters found on YouTube video');
        }

        // Step 2: Download audio and detect silences
        taskService.update(task.id, { status: 'running', progress: 30 });
        const audioPath = await ytDlp.downloadAudio(sourceUrl);

        try {
          taskService.update(task.id, { status: 'running', progress: 50 });
          const { regions } = await detectAllSilenceRegions(audioPath, { threshold: -40, minDuration: 0.5 });

          // Step 3: Match tracks to chapters and refine with silence detection
          taskService.update(task.id, { status: 'running', progress: 70 });
          await resyncTimestamps(sorted, chapters, regions);

          // Invalidate cache for affected tracks
          const { cacheService } = await import('../plugins/loader');
          for (const track of sorted) {
            cacheService.invalidate(`track-${track.id}`);
          }

          taskService.update(task.id, { status: 'completed', progress: 100 });
        } finally {
          await ytDlp.cleanupTempFile(audioPath);
        }
      } catch (error) {
        logger.error(`Resync failed: ${error}`);
        taskService.update(task.id, { status: 'failed' });
      }
    })();

    return task;
  },
});

async function resyncTimestamps(sorted: Track[], chapters: YtDlpChapter[], regions: { start: number; end: number }[]) {
  if (sorted.length === 0 || chapters.length === 0) {
    return;
  }

  const findClosestSilence = (boundary: number, maxDist: number) => {
    let closest: (typeof regions)[0] | null = null;
    let closestDist = maxDist;
    for (const r of regions) {
      const mid = (r.start + r.end) / 2;
      const dist = Math.abs(mid - boundary);
      if (dist < closestDist) {
        closestDist = dist;
        closest = r;
      }
    }
    return closest;
  };

  // Match each track to a chapter by title similarity
  const matchTrackToChapter = (track: Track): YtDlpChapter | undefined => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trackTitle = normalize(track.title);
    return chapters.find((ch) => normalize(ch.title) === trackTitle) ?? chapters.find((ch) => normalize(ch.title).includes(trackTitle) || trackTitle.includes(normalize(ch.title)));
  };

  for (const track of sorted) {
    const chapter = matchTrackToChapter(track);
    if (!chapter) {
      logger.warn(`Resync: no chapter match for "${track.title}"`);
      continue;
    }

    let newStart = chapter.start_time;
    let newEnd = chapter.end_time;

    // Fine-tune boundaries with silence detection
    const chapterDuration = newEnd - newStart;
    const maxDist = Math.max(Math.min(5, chapterDuration * 0.3), 0.5);

    const startSilence = findClosestSilence(newStart, maxDist);
    if (startSilence) {
      newStart = startSilence.end;
    }

    const endSilence = findClosestSilence(newEnd, maxDist);
    if (endSilence) {
      newEnd = endSilence.start;
    }

    // Guard against invalid result — fall back to chapter timestamps
    if (newEnd <= newStart) {
      newStart = chapter.start_time;
      newEnd = chapter.end_time;
    }

    const duration = Math.max(1, Math.round(newEnd - newStart));
    logger.info(`Resync track ${track.id} "${track.title}": start=${newStart}, end=${newEnd}, duration=${duration}`);
    await trackRepository.update(track.id, {
      metadata: { ...track.metadata, startTime: newStart, endTime: newEnd },
      duration,
    });
  }
}
