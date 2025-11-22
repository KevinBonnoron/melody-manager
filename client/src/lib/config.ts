import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

async function getEnv(name: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    if (name === 'VITE_PB_URL') {
      return value ? `${value}/db` : null;
    }
    if (name === 'VITE_SERVER_URL') {
      return value ? `${value}/api` : null;
    }
  }

  const value = import.meta.env[name];
  if (!value) {
    if (Capacitor.isNativePlatform()) {
      return null;
    }
    throw new Error(`Environment variable ${name} is not set`);
  }

  return value;
}

async function loadConfig() {
  const pbUrl = await getEnv('VITE_PB_URL');
  const serverUrl = await getEnv('VITE_SERVER_URL');

  return {
    pocketbase: {
      url: pbUrl || '',
    },
    server: {
      url: serverUrl || '',
    },
  };
}

let configCache: Awaited<ReturnType<typeof loadConfig>> | null = null;

export async function getConfig(forceReload = false) {
  if (!configCache || forceReload) {
    configCache = await loadConfig();
  }
  return configCache;
}

export function resetConfig() {
  configCache = null;
}

export const config = await loadConfig();
