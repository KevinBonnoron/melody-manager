import type { PocketBaseRecord } from './pocketbase.type';

interface BaseProvider extends PocketBaseRecord {
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface TrackProvider extends BaseProvider {
  category: 'track';
}

export interface DeviceProvider extends BaseProvider {
  category: 'device';
}

export type Provider = TrackProvider | DeviceProvider;
