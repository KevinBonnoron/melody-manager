import { EventSource } from 'eventsource';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { albumRoute, artistRoute, deviceRoute, metadataRoute, playlistRoute, pluginRoute, searchRoute, shareRoute, taskRoute, trackRoute } from './routes';

// @ts-expect-error - EventSource is not typed
global.EventSource = EventSource;

export const app = new Hono()
  .basePath('/api')
  .use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  )
  .route('/albums', albumRoute)
  .route('/artists', artistRoute)
  .route('/devices', deviceRoute)
  .route('/playlists', playlistRoute)
  .route('/plugins', pluginRoute)
  .route('/search', searchRoute)
  .route('/metadata', metadataRoute)
  .route('/share', shareRoute)
  .route('/tasks', taskRoute)
  .route('/tracks', trackRoute);
