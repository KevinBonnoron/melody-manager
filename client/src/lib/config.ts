import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { createEnv } from '@melody-manager/shared';

async function resolveEnv(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const name of ['VITE_PB_URL', 'VITE_SERVER_URL', 'VITE_REGISTRATION_DISABLED']) {
    vars[name] = import.meta.env[name] ?? '';
  }

  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    const serverUrl = value?.replace(/\/+$/, '');
    if (serverUrl) {
      vars.VITE_PB_URL = `${serverUrl}/db`;
      vars.VITE_SERVER_URL = `${serverUrl}/api`;
    }
  }

  return vars;
}

const resolved = await resolveEnv();
const env = createEnv((name) => resolved[name]);
export const config = {
  nodeEnv: env('NODE_ENV').string('development'),
  pb: {
    url: env('VITE_PB_URL').string('http://localhost:8090'),
  },
  server: {
    url: env('VITE_SERVER_URL').string(`${window.location.origin}/api`),
  },
  registrationDisabled: env('VITE_REGISTRATION_DISABLED').boolean(false),
} as const;
