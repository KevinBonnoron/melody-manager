import { Hono } from 'hono';
import { deviceRegistry, providerRegistry } from '../providers';

export const pluginRoute = new Hono().get('/', (c) => {
  return c.json([...providerRegistry.getManifests(), ...deviceRegistry.getManifests()]);
});
