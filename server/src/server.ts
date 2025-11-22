import { EventSource } from 'eventsource';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { albumRoute, artistRoute, deviceRoute, playlistRoute, searchRoute, trackRoute } from './routes';

// @ts-expect-error - EventSource is not typed
global.EventSource = EventSource;

export function createApp() {
  const app = new Hono().basePath('/api');

  app
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
    .route('/search', searchRoute)
    .route('/tracks', trackRoute);

  return app;
}
