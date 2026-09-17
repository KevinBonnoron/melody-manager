import type { SearchResult } from '@/shared';
import { readSearchCache, SEARCH_CACHE_TTL_MS, type SearchCache, searchCacheKey, writeSearchCache } from './search-cache';
import { describe, expect, it } from 'bun:test';

const hit = (origin: string): SearchResult => ({ type: 'track', provider: 'youtube', origin, title: origin });

describe('search cache', () => {
  it('hands back a search that was already run', () => {
    const cache: SearchCache = new Map();
    writeSearchCache(cache, searchCacheKey('youtube', 'zelda'), [hit('a')], 0);

    expect(readSearchCache(cache, searchCacheKey('youtube', 'zelda'), 1000)).toEqual([hit('a')]);
  });

  it('tells apart the same words asked of other sources', () => {
    const cache: SearchCache = new Map();
    writeSearchCache(cache, searchCacheKey('youtube', 'zelda'), [hit('a')], 0);

    expect(readSearchCache(cache, searchCacheKey('youtube,soundcloud', 'zelda'), 0)).toBeUndefined();
  });

  it('forgets a search once it has gone stale', () => {
    const cache: SearchCache = new Map();
    const key = searchCacheKey('youtube', 'zelda');
    writeSearchCache(cache, key, [hit('a')], 0);

    expect(readSearchCache(cache, key, SEARCH_CACHE_TTL_MS)).toEqual([hit('a')]);
    expect(readSearchCache(cache, key, SEARCH_CACHE_TTL_MS + 1)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('keeps the last searches and drops the oldest', () => {
    const cache: SearchCache = new Map();
    for (let i = 0; i < 21; i++) {
      writeSearchCache(cache, searchCacheKey('youtube', `query-${i}`), [hit(`a-${i}`)], i);
    }

    expect(cache.size).toBe(20);
    expect(readSearchCache(cache, searchCacheKey('youtube', 'query-0'), 21)).toBeUndefined();
    expect(readSearchCache(cache, searchCacheKey('youtube', 'query-20'), 21)).toEqual([hit('a-20')]);
  });

  it('moves a search that was run again back to the front', () => {
    const cache: SearchCache = new Map();
    const first = searchCacheKey('youtube', 'first');
    writeSearchCache(cache, first, [hit('a')], 0);
    writeSearchCache(cache, searchCacheKey('youtube', 'second'), [hit('b')], 1);
    writeSearchCache(cache, first, [hit('c')], 2);

    expect([...cache.keys()].at(-1)).toBe(first);
  });
});
