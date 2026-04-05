import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { playlistLikeRepository } from '../repositories';
import { playlistService, trackSourceService } from '../services';

const addPlaylistSchema = z.object({
  url: z.string().url(),
});

const idParam = z.object({
  id: z.string(),
});

const updatePlaylistSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  tracks: z.array(z.string()).optional(),
});

const addTracksSchema = z.object({
  trackIds: z.array(z.string()).min(1),
});

export const playlistRoute = new Hono()
  .get('/', async (c) => {
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const likes = await playlistLikeRepository.getAllBy(pbFilter('user = {:userId}', { userId }));
      const playlistIds = likes.map((l) => l.playlist);
      const filter = playlistIds.map((_, i) => `id = {:id${i}}`).join(' || ');
      const params = Object.fromEntries(playlistIds.map((id, i) => [`id${i}`, id]));
      const playlists = playlistIds.length > 0 ? await playlistService.getAllBy(pbFilter(filter, params)) : [];
      return c.json(playlists);
    } catch (error) {
      logger.error(`Error listing playlists: ${error}`);
      return c.json({ error: 'Failed to list playlists' }, 500);
    }
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const playlist = await playlistService.getOne(id);
      if (!playlist) {
        return c.json({ error: 'Playlist not found' }, 404);
      }

      return c.json(playlist);
    } catch (error) {
      logger.error(`Error getting playlist: ${error}`);
      return c.json({ error: 'Failed to get playlist' }, 500);
    }
  })
  .post('/add', zValidator('json', addPlaylistSchema), async (c) => {
    const { url } = c.req.valid('json');
    const userId = c.get('userId') as string | null;

    try {
      const task = await trackSourceService.addPlaylistFromUrl(url, userId);
      return c.json({ taskId: task.id });
    } catch (error) {
      logger.error(`Error adding playlist: ${error}`);
      const message = error instanceof Error ? error.message : 'Failed to add playlist';
      return c.json({ error: message }, 500);
    }
  })
  .put('/:id', zValidator('param', idParam), zValidator('json', updatePlaylistSchema), async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const like = await playlistLikeRepository.getOneBy(pbFilter('user = {:userId} && playlist = {:id}', { userId, id }));
    if (!like) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const playlist = await playlistService.update(id, data);
      return c.json(playlist);
    } catch (error) {
      logger.error(`Error updating playlist: ${error}`);
      return c.json({ error: 'Failed to update playlist' }, 500);
    }
  })
  .delete('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const like = await playlistLikeRepository.getOneBy(pbFilter('user = {:userId} && playlist = {:id}', { userId, id }));
    if (!like) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const success = await playlistService.delete(id);
      if (!success) {
        return c.json({ error: 'Playlist not found' }, 404);
      }

      return c.json({ message: 'Playlist deleted successfully' });
    } catch (error) {
      logger.error(`Error deleting playlist: ${error}`);
      return c.json({ error: 'Failed to delete playlist' }, 500);
    }
  })
  .post('/:id/tracks', zValidator('param', idParam), zValidator('json', addTracksSchema), async (c) => {
    const { id } = c.req.valid('param');
    const { trackIds } = c.req.valid('json');
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const like = await playlistLikeRepository.getOneBy(pbFilter('user = {:userId} && playlist = {:id}', { userId, id }));
    if (!like) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const playlist = await playlistService.getOne(id);
      if (!playlist) {
        return c.json({ error: 'Playlist not found' }, 404);
      }

      const updatedTracks = [...new Set([...playlist.tracks, ...trackIds])];
      const updated = await playlistService.update(id, { tracks: updatedTracks });
      return c.json(updated);
    } catch (error) {
      logger.error(`Error adding tracks to playlist: ${error}`);
      return c.json({ error: 'Failed to add tracks' }, 500);
    }
  })
  .delete('/:id/tracks/:trackId', zValidator('param', z.object({ id: z.string(), trackId: z.string() })), async (c) => {
    const { id, trackId } = c.req.valid('param');
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const like = await playlistLikeRepository.getOneBy(pbFilter('user = {:userId} && playlist = {:id}', { userId, id }));
    if (!like) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const playlist = await playlistService.getOne(id);
      if (!playlist) {
        return c.json({ error: 'Playlist not found' }, 404);
      }

      const updatedTracks = playlist.tracks.filter((t) => t !== trackId);
      const updated = await playlistService.update(id, { tracks: updatedTracks });
      return c.json(updated);
    } catch (error) {
      logger.error(`Error removing track from playlist: ${error}`);
      return c.json({ error: 'Failed to remove track' }, 500);
    }
  });
