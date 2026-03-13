import { Hono } from 'hono';
import { pluginRegistry } from '../plugins';

export const pluginRoute = new Hono().get('/', (c) => {
  return c.json(pluginRegistry.getManifests());
});
