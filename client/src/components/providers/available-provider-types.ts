import type { DeviceProviderType, TrackProviderType } from '@melody-manager/shared';

export const TRACK_PROVIDER_TYPES: TrackProviderType[] = ['local', 'youtube', 'soundcloud', 'spotify', 'bandcamp'];

export const DEVICE_PROVIDER_TYPES: DeviceProviderType[] = ['sonos'];

export type ProviderTypeWithCategory = { type: TrackProviderType; category: 'track' } | { type: DeviceProviderType; category: 'device' };

export const ALL_AVAILABLE_PROVIDER_TYPES: ProviderTypeWithCategory[] = [...TRACK_PROVIDER_TYPES.map((type) => ({ type, category: 'track' as const })), ...DEVICE_PROVIDER_TYPES.map((type) => ({ type, category: 'device' as const }))];

export function getDefaultConfigForType(type: TrackProviderType | DeviceProviderType): Record<string, unknown> {
  switch (type) {
    case 'local':
      return { path: '' };
    case 'youtube':
      return { splitChapters: false };
    case 'soundcloud':
      return {};
    case 'spotify':
      return { clientId: '', clientSecret: '' };
    case 'bandcamp':
      return { cookies: '' };
    case 'sonos':
      return {};
    default:
      return {};
  }
}
