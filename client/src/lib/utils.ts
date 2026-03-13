import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number, format: 'short' | 'long' = 'short') {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (format === 'short') {
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  const parts: string[] = [];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}min`);
  }
  parts.push(`${secs}sec`);
  return parts.join(' ');
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
