import PocketBase from 'pocketbase';
import { config } from './config';

export const pb = new PocketBase(config.pb.url).autoCancellation(false);
export const pbFilter = pb.filter.bind(pb);
