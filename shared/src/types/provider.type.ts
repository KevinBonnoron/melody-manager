import type { PocketBaseRecord } from './pocketbase.type';

interface BaseProvider extends PocketBaseRecord {
  type: string;
  category: 'track' | 'device';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface TrackProvider extends BaseProvider {
  category: 'track';
}

export interface DeviceProvider extends BaseProvider {
  category: 'device';
}

export type Provider = TrackProvider | DeviceProvider;

export interface Connection extends PocketBaseRecord {
  provider: string;
  user: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ProviderGrant extends PocketBaseRecord {
  provider: string;
  user: string;
}
