import Pocketbase from 'pocketbase';
import { config } from './config';

export function createPocketBase(url: string) {
  const instance = new Pocketbase(url);
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

export const pb = createPocketBase(config.pocketbase.url);
