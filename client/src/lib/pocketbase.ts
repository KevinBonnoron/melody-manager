import Pocketbase, { LocalAuthStore } from 'pocketbase';
import { config } from './config';

const APP_NAME = 'melody-manager';

export function createPocketBase(url: string) {
  const instance = new Pocketbase(url, new LocalAuthStore(`pb_auth_${APP_NAME}`));
  instance.beforeSend = (url, options) => {
    if (instance.authStore.token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${instance.authStore.token}`,
      };
    }
    return { url, options };
  };
  return instance;
}

export const pb = createPocketBase(config.pb.url);
