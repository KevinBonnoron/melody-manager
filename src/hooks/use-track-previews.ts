import { useSyncExternalStore } from 'react';
import { tracksClient } from '@/clients/tracks.client';
import type { ResolvedTrack } from '@/shared';
import { readCache, type TimedCache, type TimedCacheLimits, writeCache } from './timed-cache';

export type TrackPreviewState = { status: 'loading' } | { status: 'ready'; tracks: ResolvedTrack[] } | { status: 'error'; cause: string };

// Held longer than a search is: what a video is cut into barely moves, and asking again costs a
// yt-dlp run that reads the description and, on a long video, the comments too.
const LIMITS: TimedCacheLimits = { ttlMs: 30 * 60 * 1000, maxEntries: 20 };

export type TrackPreviews = TimedCache<TrackPreviewState>;

interface PreviewStore {
  previews: TrackPreviews;
  expanded: ReadonlySet<string>;
  lastChanged: string | null;
}

let store: PreviewStore = { previews: new Map(), expanded: new Set(), lastChanged: null };
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

function publish(next: PreviewStore) {
  store = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PreviewStore {
  return store;
}

function record(url: string, state: TrackPreviewState) {
  const previews: TrackPreviews = new Map(store.previews);
  writeCache(previews, url, state, Date.now(), LIMITS);
  publish({ ...store, previews, lastChanged: url });
}

// The delegate throws with the status line for a message and keeps the server's answer in
// `body`, so the name the API gave the failure is only reachable there.
function causeOf(error: unknown): string {
  const body = (error as { body?: { message?: unknown } } | null)?.body;
  return typeof body?.message === 'string' ? body.message : '';
}

async function load(url: string) {
  if (inFlight.has(url)) {
    return;
  }

  inFlight.add(url);
  record(url, { status: 'loading' });
  try {
    const { tracks } = await tracksClient.previewFromUrl(url);
    record(url, { status: 'ready', tracks: tracks ?? [] });
  } catch (error) {
    record(url, { status: 'error', cause: causeOf(error) });
  } finally {
    inFlight.delete(url);
  }
}

function toggle(url: string) {
  const expanded = new Set(store.expanded);
  const collapsing = expanded.delete(url);
  if (!collapsing) {
    expanded.add(url);
  }

  publish({ ...store, expanded, lastChanged: collapsing ? store.lastChanged : url });
  if (!collapsing && readCache(store.previews, url, Date.now(), LIMITS)?.status !== 'ready') {
    void load(url);
  }
}

function retry(url: string) {
  void load(url);
}

export function useTrackPreviews() {
  const { previews, expanded, lastChanged } = useSyncExternalStore(subscribe, getSnapshot);
  return { previews, expanded, lastChanged, toggle, retry };
}
