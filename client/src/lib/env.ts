import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

async function env(name: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    if (name === 'VITE_PB_URL') {
      return value ? `${value}/db` : '';
    }
    if (name === 'VITE_SERVER_URL') {
      return value ? `${value}/api` : '';
    }

    return '';
  }

  return import.meta.env[name];
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
