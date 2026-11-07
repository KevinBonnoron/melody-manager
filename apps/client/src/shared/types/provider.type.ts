import type { PocketBaseRecord } from './pocketbase.type';

interface BaseProvider extends PocketBaseRecord {
  type: string;
  category: 'track' | 'device';
  enabled: boolean;
}

export interface ProviderConfig extends PocketBaseRecord {
  type: string;
  config: Record<string, unknown>;
}

export interface TrackProvider extends BaseProvider {
  category: 'track';
}

export interface DeviceProvider extends BaseProvider {
  category: 'device';
}

export type Provider = TrackProvider | DeviceProvider;

export interface Connection extends PocketBaseRecord {
  type: string;
  user: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}
