import { join } from 'node:path';

function getEnvOrDefault<T>(name: string, defaultValue: T): T {
  return (process.env[name] as T) || defaultValue;
}

export const config = {
  nodeEnv: getEnvOrDefault('ENV', 'development'),
  pb: {
    url: getEnvOrDefault('PB_URL', 'http://localhost:8090'),
  },
  server: {
    url: getEnvOrDefault('SERVER_URL', 'http://localhost:3000'),
  },
  cache: {
    dir: getEnvOrDefault('CACHE_DIR', '/tmp/melody-manager-cache'),
    maxFiles: getEnvOrDefault<number>('CACHE_MAX_FILES', 500),
    maxSize: getEnvOrDefault<number>('CACHE_MAX_SIZE', 5 * 1024 * 1024 * 1024),
  },
  plugins: {
    dir: getEnvOrDefault('PLUGINS_DIR', join(process.cwd(), '..', 'plugins')),
  },
};
