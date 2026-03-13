import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

async function env(name: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    const serverUrl = value?.replace(/\/+$/, '');
    if (name === 'VITE_PB_URL') {
      return serverUrl ? `${serverUrl}/db` : (import.meta.env[name] ?? '');
    }
    if (name === 'VITE_SERVER_URL') {
      return serverUrl ? `${serverUrl}/api` : (import.meta.env[name] ?? '');
    }

    return import.meta.env[name] ?? '';
  }

  return import.meta.env[name] ?? '';
}

async function loadEnv() {
  return {
    pocketbase: {
      url: await env('VITE_PB_URL'),
    },
    server: {
      url: await env('VITE_SERVER_URL'),
    },
    registrationDisabled: (await env('VITE_REGISTRATION_DISABLED')) === 'true',
  };
}

export const config = await loadEnv();
