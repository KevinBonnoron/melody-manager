import type { TrackProviderType } from '@melody-manager/shared';

/**
 * Detect provider type from a URL
 * @param query - User query (may be a URL or search string)
 * @returns Provider type if URL is detected, null otherwise
 */
export function detectProviderFromUrl(query: string): TrackProviderType | null {
  try {
    const lowerQuery = query.toLowerCase().trim();

    if (lowerQuery.includes('youtube.com') || lowerQuery.includes('youtu.be')) {
      return 'youtube';
    }

    if (lowerQuery.includes('spotify.com') || lowerQuery.startsWith('spotify:')) {
      return 'spotify';
    }

    if (lowerQuery.includes('soundcloud.com')) {
      return 'soundcloud';
    }

    if (lowerQuery.includes('bandcamp.com')) {
      return 'bandcamp';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a query is a URL
 * @param query - User query
 * @returns True if query appears to be a URL
 */
export function isUrl(query: string): boolean {
  try {
    const lowerQuery = query.toLowerCase().trim();
    return lowerQuery.startsWith('http://') || lowerQuery.startsWith('https://') || lowerQuery.startsWith('spotify:') || lowerQuery.includes('://');
  } catch {
    return false;
  }
}
