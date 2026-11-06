import { cacheKey, readCache, type TimedCache, type TimedCacheLimits, writeCache } from './timed-cache';
import { describe, expect, it } from 'bun:test';

const LIMITS: TimedCacheLimits = { ttlMs: 1000, maxEntries: 3 };
const fresh = (): TimedCache<string> => new Map();

describe('timed cache', () => {
  it('hands back what was written', () => {
    const cache = fresh();
    writeCache(cache, 'k', 'v', 0, LIMITS);

    expect(readCache(cache, 'k', 500, LIMITS)).toBe('v');
  });

  it('knows nothing of a key never written', () => {
    expect(readCache(fresh(), 'k', 0, LIMITS)).toBeUndefined();
  });

  it('holds an entry up to its age and no longer', () => {
    const cache = fresh();
    writeCache(cache, 'k', 'v', 0, LIMITS);

    expect(readCache(cache, 'k', 1000, LIMITS)).toBe('v');
    expect(readCache(cache, 'k', 1001, LIMITS)).toBeUndefined();
  });

  it('leaves the map alone while reading, so a rendered snapshot does not change under it', () => {
    const cache = fresh();
    writeCache(cache, 'k', 'v', 0, LIMITS);
    const snapshot = cache;

    expect(readCache(cache, 'k', 5000, LIMITS)).toBeUndefined();
    expect(snapshot.size).toBe(1);
  });

  it('drops what has gone stale the next time anything is written', () => {
    const cache = fresh();
    writeCache(cache, 'old', 'v', 0, LIMITS);
    writeCache(cache, 'new', 'v', 2000, LIMITS);

    expect(cache.has('old')).toBe(false);
    expect(cache.has('new')).toBe(true);
  });

  it('keeps the last entries and drops the oldest', () => {
    const cache = fresh();
    for (let i = 0; i < 4; i++) {
      writeCache(cache, `k-${i}`, `v-${i}`, i, LIMITS);
    }

    expect(cache.size).toBe(3);
    expect(readCache(cache, 'k-0', 4, LIMITS)).toBeUndefined();
    expect(readCache(cache, 'k-3', 4, LIMITS)).toBe('v-3');
  });

  it('moves an entry written again back to the front', () => {
    const cache = fresh();
    writeCache(cache, 'first', 'a', 0, LIMITS);
    writeCache(cache, 'second', 'b', 1, LIMITS);
    writeCache(cache, 'first', 'c', 2, LIMITS);

    expect([...cache.keys()].at(-1)).toBe('first');
    expect(readCache(cache, 'first', 2, LIMITS)).toBe('c');
  });

  it('overwrites rather than keeping two of a key', () => {
    const cache = fresh();
    writeCache(cache, 'k', 'a', 0, LIMITS);
    writeCache(cache, 'k', 'b', 1, LIMITS);

    expect(cache.size).toBe(1);
    expect(readCache(cache, 'k', 1, LIMITS)).toBe('b');
  });

  it('tells apart the same words asked of other sources', () => {
    expect(cacheKey('youtube', 'zelda')).not.toBe(cacheKey('youtube,soundcloud', 'zelda'));
  });

  it('cannot be made to spell one key out of different parts', () => {
    expect(cacheKey('a', 'b c')).not.toBe(cacheKey('a b', 'c'));
    expect(cacheKey('a,b', 'c')).not.toBe(cacheKey('a', 'b,c'));
  });

  it('keys one part on its own', () => {
    expect(cacheKey('https://youtu.be/x')).toBe('https://youtu.be/x');
  });
});
