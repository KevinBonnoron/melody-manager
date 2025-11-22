const { loadPlugins } = await import('./plugins');
await loadPlugins();

const { createApp } = await import('./server');
const server = createApp();

export default {
  port: 3000,
  hostname: '0.0.0.0',
  fetch: server.fetch,
  idleTimeout: 255,
};
