import { createEnv } from '@melody-manager/shared';

const env = createEnv((name) => process.env[name]);

export const config = {
  nodeEnv: env('ENV').string('development'),
  pb: {
    url: env('PB_URL').string('http://localhost:8090'),
    adminEmail: env('PB_SUPERUSER_EMAIL').string(''),
    adminPassword: env('PB_SUPERUSER_PASSWORD').string(''),
  },
  server: {
    url: env('SERVER_URL').string('http://localhost:3000'),
  },
  cache: {
    dir: env('CACHE_DIR').string('/tmp/melody-manager-cache'),
    maxFiles: env('CACHE_MAX_FILES').number(500),
    maxSize: env('CACHE_MAX_SIZE').number(5 * 1024 * 1024 * 1024),
  },
};
