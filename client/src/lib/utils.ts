import { type ClassValue, clsx } from 'clsx';
import { intervalToDuration } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number, format: 'short' | 'long' = 'short') {
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });

  if (format === 'short') {
    const parts: string[] = [];
    if (duration.hours) {
      parts.push(String(duration.hours));
      parts.push(String(duration.minutes ?? 0).padStart(2, '0'));
    } else {
      parts.push(String(duration.minutes ?? 0));
    }
    parts.push(String(duration.seconds ?? 0).padStart(2, '0'));
    return parts.join(':');
  }

  const parts: string[] = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}min`);
  if (duration.seconds !== undefined) parts.push(`${duration.seconds}sec`);
  return parts.length > 0 ? parts.join(' ') : '0sec';
}

export function getProviderColor(provider: string) {
  switch (provider) {
    case 'local':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'youtube':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'spotify':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
    case 'soundcloud':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
  }
}

export function getProviderColorContrast(provider: string) {
  switch (provider) {
    case 'local':
      return 'bg-blue-600 text-white border-0';
    case 'youtube':
      return 'bg-red-600 text-white border-0';
    case 'spotify':
      return 'bg-green-600 text-white border-0';
    case 'soundcloud':
      return 'bg-orange-600 text-white border-0';
    default:
      return 'bg-gray-600 text-white border-0';
  }
}
