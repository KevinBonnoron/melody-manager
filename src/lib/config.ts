import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { createEnv } from '@/shared';

async function resolveEnv(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const name of ['VITE_PB_URL', 'VITE_SERVER_URL', 'VITE_REGISTRATION_DISABLED']) {
    // Leave it absent when empty: `string()` falls back on undefined only, so an
    // empty value would win over the default and make every URL relative.
    const value = import.meta.env[name];
    if (value) {
      vars[name] = value;
    }
  }

  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    const serverUrl = value?.replace(/\/+$/, '');
    if (serverUrl) {
      // Single Go binary serves PocketBase and /api on the same origin.
      vars.VITE_PB_URL = serverUrl;
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
    // Same-origin by default: in production the Go binary serves PocketBase,
    // /api and the client together, and in development Vite proxies both to it.
    url: env('VITE_PB_URL').string(window.location.origin),
  },
  server: {
    url: env('VITE_SERVER_URL').string(`${window.location.origin}/api`),
  },
  registrationDisabled: env('VITE_REGISTRATION_DISABLED').boolean(false),
} as const;
