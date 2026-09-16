import { Preferences } from '@capacitor/preferences';
import { isStandaloneClient } from '@/lib/client-target';
import { createEnv } from '@/shared';

async function resolveEnv(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const name of ['VITE_PB_URL', 'VITE_SERVER_URL']) {
    const value = import.meta.env[name];
    if (value) {
      vars[name] = value;
    }
  }

  if (isStandaloneClient) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    const serverUrl = value?.replace(/\/+$/, '');
    if (serverUrl) {
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
    url: env('VITE_PB_URL').string(window.location.origin),
  },
  server: {
    url: env('VITE_SERVER_URL').string(`${window.location.origin}/api`),
  },
} as const;
