import { useCallback, useEffect, useRef, useState } from 'react';
import { tracksClient } from '@/clients/tracks.client';
import type { ResolvedTrack } from '@/shared';

export type TrackPreviewState = { status: 'loading' } | { status: 'ready'; tracks: ResolvedTrack[] } | { status: 'error' };

export function useTrackPreviews() {
  const [previews, setPreviews] = useState<ReadonlyMap<string, TrackPreviewState>>(() => new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [lastChanged, setLastChanged] = useState<string | null>(null);
  const previewsRef = useRef<ReadonlyMap<string, TrackPreviewState>>(new Map());
  const expandedRef = useRef<ReadonlySet<string>>(new Set());
  const requestsRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const requests = requestsRef.current;
    return () => {
      for (const request of requests.values()) {
        request.abort();
      }

      requests.clear();
    };
  }, []);

  const store = useCallback((url: string, state: TrackPreviewState) => {
    const next = new Map(previewsRef.current);
    next.set(url, state);
    previewsRef.current = next;
    setPreviews(next);
    setLastChanged(url);
  }, []);

  const load = useCallback(
    async (url: string) => {
      if (requestsRef.current.has(url)) {
        return;
      }

      const request = new AbortController();
      requestsRef.current.set(url, request);
      store(url, { status: 'loading' });
      try {
        const { tracks } = await tracksClient.previewFromUrl(url, { signal: request.signal });
        if (!request.signal.aborted) {
          store(url, { status: 'ready', tracks: tracks ?? [] });
        }
      } catch {
        if (!request.signal.aborted) {
          store(url, { status: 'error' });
        }
      } finally {
        if (requestsRef.current.get(url) === request) {
          requestsRef.current.delete(url);
        }
      }
    },
    [store],
  );

  const toggle = useCallback(
    (url: string) => {
      const next = new Set(expandedRef.current);
      const collapsing = next.delete(url);
      if (!collapsing) {
        next.add(url);
      }

      expandedRef.current = next;
      setExpanded(next);
      if (!collapsing && previewsRef.current.get(url)?.status !== 'ready') {
        void load(url);
      }
    },
    [load],
  );

  const retry = useCallback(
    (url: string) => {
      void load(url);
    },
    [load],
  );

  return { previews, expanded, lastChanged, toggle, retry };
}
