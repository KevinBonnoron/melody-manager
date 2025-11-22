import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from '../lib/logger';
import { deviceSourceService } from '../services';

export const deviceRoute = new Hono()
  .get('/', (c) => {
    const devices = deviceSourceService.getKnownDevices();
    return c.json({
      success: true,
      data: devices,
    });
  })

  .get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      const unsubscribe = deviceSourceService.onDevicesChange((devices) => {
        stream.writeSSE({
          data: JSON.stringify(devices),
          event: 'devices',
        });
      });

      stream.onAbort(() => {
        unsubscribe();
      });
    });
  })

  .post('/:deviceId/play/:trackId', async (c) => {
    const { deviceId, trackId } = c.req.param();

    try {
      await deviceSourceService.playTrack(deviceId, trackId);
      return c.json({
        success: true,
        message: 'Playback started',
      });
    } catch (error) {
      logger.error(`Play error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to play',
        },
        500,
      );
    }
  })

  .post('/:deviceId/play', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.resume(deviceId);
      return c.json({
        success: true,
        message: 'Playback resumed',
      });
    } catch (error) {
      logger.error(`Resume error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to resume',
        },
        500,
      );
    }
  })

  .post('/:deviceId/pause', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.pause(deviceId);
      return c.json({
        success: true,
        message: 'Playback paused',
      });
    } catch (error) {
      logger.error(`Pause error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to pause',
        },
        500,
      );
    }
  })

  .post('/:deviceId/stop', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.stop(deviceId);
      return c.json({
        success: true,
        message: 'Playback stopped',
      });
    } catch (error) {
      logger.error(`Stop error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to stop',
        },
        500,
      );
    }
  })

  .post('/:deviceId/next', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.next(deviceId);
      return c.json({
        success: true,
        message: 'Skipped to next track',
      });
    } catch (error) {
      logger.error(`Next error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to skip',
        },
        500,
      );
    }
  })

  .post('/:deviceId/previous', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.previous(deviceId);
      return c.json({
        success: true,
        message: 'Skipped to previous track',
      });
    } catch (error) {
      logger.error(`Previous error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to go to previous',
        },
        500,
      );
    }
  })

  .post('/:deviceId/seek', async (c) => {
    const deviceId = c.req.param('deviceId');
    const body = await c.req.json();
    const { position } = body;

    if (typeof position !== 'number') {
      return c.json(
        {
          success: false,
          message: 'Position must be a number',
        },
        400,
      );
    }

    try {
      await deviceSourceService.seek(deviceId, position);
      return c.json({
        success: true,
        message: 'Seeked to position',
      });
    } catch (error) {
      logger.error(`Seek error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to seek',
        },
        500,
      );
    }
  })

  .post('/:deviceId/volume', async (c) => {
    const deviceId = c.req.param('deviceId');
    const body = await c.req.json();
    const { volume } = body;

    if (typeof volume !== 'number' || volume < 0 || volume > 100) {
      return c.json(
        {
          success: false,
          message: 'Volume must be a number between 0 and 100',
        },
        400,
      );
    }

    try {
      await deviceSourceService.setVolume(deviceId, volume);
      return c.json({
        success: true,
        message: 'Volume set',
      });
    } catch (error) {
      logger.error(`Volume error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to set volume',
        },
        500,
      );
    }
  })

  .get('/:deviceId/state', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      const [state, track, volume] = await Promise.all([deviceSourceService.getCurrentState(deviceId), deviceSourceService.getCurrentTrack(deviceId), deviceSourceService.getVolume(deviceId)]);

      return c.json({
        success: true,
        data: {
          state,
          track,
          volume,
        },
      });
    } catch (error) {
      logger.error(`State error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to get state',
        },
        500,
      );
    }
  })

  .post('/:deviceId/queue/:trackId', async (c) => {
    const { deviceId, trackId } = c.req.param();

    try {
      await deviceSourceService.addTrackToQueue(deviceId, trackId);
      return c.json({
        success: true,
        message: 'Track added to queue',
      });
    } catch (error) {
      logger.error(`Queue error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to add to queue',
        },
        500,
      );
    }
  })

  .delete('/:deviceId/queue', async (c) => {
    const deviceId = c.req.param('deviceId');

    try {
      await deviceSourceService.clearQueue(deviceId);
      return c.json({
        success: true,
        message: 'Queue cleared',
      });
    } catch (error) {
      logger.error(`Clear queue error: ${error}`);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to clear queue',
        },
        500,
      );
    }
  });
