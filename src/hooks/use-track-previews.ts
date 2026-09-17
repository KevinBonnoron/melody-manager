import { useSyncExternalStore } from 'react';
import { tracksClient } from '@/clients/tracks.client';
import type { ResolvedTrack } from '@/shared';

export type TrackPreviewState = { status: 'loading' } | { status: 'ready'; tracks: ResolvedTrack[] } | { status: 'error'; cause: string };

interface PreviewStore {
  previews: ReadonlyMap<string, TrackPreviewState>;
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
  const previews = new Map(store.previews);
  previews.set(url, state);
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
  if (!collapsing && store.previews.get(url)?.status !== 'ready') {
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
