import PocketBase from 'pocketbase';
import { config } from './config';

export const pb = new PocketBase(config.pb.url).autoCancellation(false);
export const pbFilter = pb.filter.bind(pb);

export async function initPocketBase(): Promise<void> {
  if (config.pb.adminEmail && config.pb.adminPassword) {
    await pb.collection('_superusers').authWithPassword(config.pb.adminEmail, config.pb.adminPassword);
  }
}
