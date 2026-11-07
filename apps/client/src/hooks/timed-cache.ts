export interface TimedCacheEntry<T> {
  value: T;
  at: number;
}

export type TimedCache<T> = Map<string, TimedCacheEntry<T>>;

export interface TimedCacheLimits {
  ttlMs: number;
  maxEntries: number;
}

// Joined by the one character a query, a source list or a URL cannot hold, so that two keys
// made of different parts cannot spell the same thing.
export function cacheKey(...parts: string[]): string {
  return parts.join('\u0000');
}

// Reading answers, it does not tidy: this same map is the snapshot a store hands to React, and
// deleting from it here would change a snapshot already rendered. Writing is where what has
// gone stale, or grown too many, is dropped.
export function readCache<T>(cache: TimedCache<T>, key: string, now: number, { ttlMs }: TimedCacheLimits): T | undefined {
  const entry = cache.get(key);
  if (entry === undefined || now - entry.at > ttlMs) {
    return undefined;
  }

  return entry.value;
}

// What is held, whatever its age: a panel already on screen keeps showing what it said, and it
// is readCache that decides when something is old enough to ask for again.
export function cachedValue<T>(cache: TimedCache<T>, key: string): T | undefined {
  return cache.get(key)?.value;
}

export function writeCache<T>(cache: TimedCache<T>, key: string, value: T, now: number, { ttlMs, maxEntries }: TimedCacheLimits): void {
  cache.delete(key);
  cache.set(key, { value, at: now });

  for (const [known, entry] of cache) {
    if (now - entry.at > ttlMs) {
      cache.delete(known);
    }
  }

  // Insertion order is the order things were last written, so the front of it is the oldest.
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done === true) {
      return;
    }

    cache.delete(oldest.value);
  }
}
