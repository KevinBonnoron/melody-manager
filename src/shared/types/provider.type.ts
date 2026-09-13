import type { PocketBaseRecord } from './pocketbase.type';

interface BaseProvider extends PocketBaseRecord {
  type: string;
  category: 'track' | 'device';
  enabled: boolean;
}

// Server-level configuration, admin-only. Split out of provider_settings so the
// collection every user reads carries no credentials.
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
