import { join } from 'node:path';

function getEnvOrDefault<T>(name: string, defaultValue: T, parse?: (value: string) => T): T {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  return parse ? parse(raw) : (raw as T);
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
    maxFiles: getEnvOrDefault('CACHE_MAX_FILES', 500, Number),
    maxSize: getEnvOrDefault('CACHE_MAX_SIZE', 5 * 1024 * 1024 * 1024, Number),
  },
  plugins: {
    dir: getEnvOrDefault('PLUGINS_DIR', join(process.cwd(), '..', 'plugins')),
  },
};
