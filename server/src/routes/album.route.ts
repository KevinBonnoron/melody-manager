import { zValidator } from '@hono/zod-validator';
import type { Track } from '@melody-manager/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { albumRepository, trackRepository } from '../repositories';
import { albumService, audioAnalysisService, cacheService, trackSourceService } from '../services';

const addAlbumSchema = z.object({
  url: z.string().url(),
});

export const albumRoute = new Hono()
  .post('/add', zValidator('json', addAlbumSchema), async (c) => {
    const { url } = c.req.valid('json');

    try {
      const tracks = await trackSourceService.addAlbumFromUrl(url);
      return c.json({ tracks, count: tracks.length });
    } catch (error) {
      logger.error(`Error adding album: ${error}`);
      const message = error instanceof Error ? error.message : 'Failed to add album';
      return c.json({ error: message }, 500);
    }
  })
  .post('/:albumId/sync-chapters', async (c) => {
    const albumId = c.req.param('albumId');

    try {
      const album = await albumRepository.getOne(albumId);
      if (!album) {
        return c.json({ error: 'Album not found' }, 404);
      }

      const tracks = await trackRepository.getAllBy(`album="${albumId}"`);
      if (tracks.length === 0) {
        return c.json({ error: 'No tracks found in album' }, 404);
      }

      const firstTrack = tracks[0];
      if (!firstTrack?.expand?.provider) {
        return c.json({ error: 'Track provider information not found' }, 400);
      }

      if (firstTrack.expand.provider.type !== 'youtube') {
        return c.json({ error: 'Chapter sync is only available for YouTube albums' }, 400);
      }

      const sourceUrl = firstTrack.sourceUrl;
      if (!sourceUrl) {
        return c.json({ error: 'Source URL not found' }, 400);
      }

      const { updates, matched, unmatched } = await audioAnalysisService.syncAlbumChapters(sourceUrl, tracks);

      const updatedTracks = await Promise.all(
        tracks.map(async (track: Track) => {
          const update = updates.get(track.id);
          if (!update) {
            return track;
          }

          const updatedMetadata = {
            ...track.metadata,
            startTime: update.startTime,
            endTime: update.endTime,
          };

          const duration = Math.floor(update.endTime - update.startTime);

          cacheService.invalidate(`track-${track.id}`);
          return await trackRepository.update(track.id, {
            metadata: updatedMetadata,
            duration,
          });
        }),
      );

      return c.json({
        success: true,
        message: `Successfully synchronized ${matched} chapters (${unmatched} unmatched)`,
        tracks: updatedTracks.map((t: Track) => {
          const update = updates.get(t.id);
          return {
            id: t.id,
            title: t.title,
            originalStart: update?.originalStartTime,
            originalEnd: update?.originalEndTime,
            newStart: update?.startTime,
            newEnd: update?.endTime,
            correction: Math.abs((update?.startTime || 0) - (update?.originalStartTime || 0)),
          };
        }),
      });
    } catch (error) {
      logger.error(`Error syncing chapters: ${error}`);

      if (error && typeof error === 'object' && 'response' in error) {
        const pbError = error as any;
        logger.error(`PocketBase error details: ${JSON.stringify(pbError.response, null, 2)}`);
        if (pbError.response?.data) {
          logger.error(`Validation errors: ${JSON.stringify(pbError.response.data, null, 2)}`);
        }
      }

      const message = error instanceof Error ? error.message : 'Failed to sync chapters';
      return c.json({ error: message }, 500);
    }
  });
