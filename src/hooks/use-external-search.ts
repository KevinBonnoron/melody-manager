import { useEffect, useState } from 'react';
import { searchClient } from '@/clients/search.client';
import type { SearchResult, SearchType } from '@/shared';
import { readSearchCache, type SearchCache, searchCacheKey, writeSearchCache } from './search-cache';

const SEARCH_TYPES: SearchType[] = ['track', 'album', 'artist', 'playlist'];
const SETTLE_MS = 500;

const cache: SearchCache = new Map();
const inFlight = new Map<string, Promise<SearchResult[]>>();

function ask(key: string, query: string): Promise<SearchResult[]> {
  const pending = inFlight.get(key);
  if (pending !== undefined) {
    return pending;
  }

  const request = Promise.allSettled(SEARCH_TYPES.map((type) => searchClient.search(query, type)))
    .then((responses) => {
      const results = responses.flatMap((response) => (response.status === 'fulfilled' ? response.value.results : []));
      if (responses.every((response) => response.status === 'fulfilled')) {
        writeSearchCache(cache, key, results, Date.now());
      }

      return results;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function useExternalSearch(query: string, providerTypes: string, enabled: boolean) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!enabled || query === '' || providerTypes === '') {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    const key = searchCacheKey(providerTypes, query);
    const known = readSearchCache(cache, key, Date.now());
    if (known !== undefined) {
      setResults(known);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;
    const settle = (found: SearchResult[]) => {
      if (!cancelled) {
        setResults(found);
        setIsSearching(false);
      }
    };

    setResults([]);
    setIsSearching(true);

    const pending = inFlight.get(key);
    if (pending !== undefined) {
      pending.then(settle).catch(() => settle([]));
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = setTimeout(() => {
      ask(key, query)
        .then(settle)
        .catch(() => settle([]));
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, providerTypes, enabled]);

  return { results, isSearching };
}
