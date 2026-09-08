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

const PROVIDER_COLORS: Record<string, { default: string; contrast: string }> = {
  local: { default: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', contrast: 'bg-blue-600 text-white border-0' },
  youtube: { default: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', contrast: 'bg-red-600 text-white border-0' },
  spotify: { default: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20', contrast: 'bg-green-600 text-white border-0' },
  soundcloud: { default: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', contrast: 'bg-orange-600 text-white border-0' },
};

const PROVIDER_COLORS_FALLBACK = { default: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20', contrast: 'bg-gray-600 text-white border-0' };
export function getProviderColor(provider: string, variant: 'default' | 'contrast' = 'default') {
  return (PROVIDER_COLORS[provider] ?? PROVIDER_COLORS_FALLBACK)[variant];
}

export function formatListeningTime(totalSeconds: number): { hours: number; minutes: number } {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { hours, minutes };
}

export function formatMonth(monthString: string, locale: string): string {
  const [year, month] = monthString.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
}

export function formatTimeAgo(date: Date): { value: number; unit: 'now' | 'minutes' | 'hours' | 'days' } {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMinutes < 1) {
    return { value: 0, unit: 'now' };
  }

  if (diffMinutes < 60) {
    return { value: diffMinutes, unit: 'minutes' };
  }

  if (diffHours < 24) {
    return { value: diffHours, unit: 'hours' };
  }

  return { value: diffDays, unit: 'days' };
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function getModifierKey(key: string) {
  return isMac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
