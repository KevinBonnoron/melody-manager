import type { SearchResult } from '@/shared';

export interface SearchCacheEntry {
  results: SearchResult[];
  at: number;
}

export type SearchCache = Map<string, SearchCacheEntry>;

export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

const MAX_ENTRIES = 20;

export function searchCacheKey(providerTypes: string, query: string): string {
  return `${providerTypes}\u0000${query}`;
}

export function readSearchCache(cache: SearchCache, key: string, now: number): SearchResult[] | undefined {
  const entry = cache.get(key);
  if (entry === undefined) {
    return undefined;
  }

  if (now - entry.at > SEARCH_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }

  return entry.results;
}

export function writeSearchCache(cache: SearchCache, key: string, results: SearchResult[], now: number): void {
  cache.delete(key);
  cache.set(key, { results, at: now });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done === true) {
      return;
    }

    cache.delete(oldest.value);
  }
}
