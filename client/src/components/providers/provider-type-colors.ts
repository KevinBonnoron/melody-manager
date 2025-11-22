import type { DeviceProviderType, TrackProviderType } from '@melody-manager/shared';

type ProviderType = TrackProviderType | DeviceProviderType;

export function getProviderTypeColors(type: ProviderType): { bg: string; icon: string } {
  switch (type) {
    case 'local':
      return { bg: 'bg-slate-500/15', icon: 'text-slate-600 dark:text-slate-400' };
    case 'youtube':
      return { bg: 'bg-red-500/15', icon: 'text-red-600 dark:text-red-400' };
    case 'soundcloud':
      return { bg: 'bg-orange-500/15', icon: 'text-orange-600 dark:text-orange-400' };
    case 'spotify':
      return { bg: 'bg-green-500/15', icon: 'text-green-600 dark:text-green-400' };
    case 'bandcamp':
      return { bg: 'bg-cyan-500/15', icon: 'text-cyan-600 dark:text-cyan-400' };
    case 'sonos':
      return { bg: 'bg-black/15 dark:bg-white/15', icon: 'text-black dark:text-white' };
    default:
      return { bg: 'bg-primary/10', icon: 'text-primary' };
  }
}
