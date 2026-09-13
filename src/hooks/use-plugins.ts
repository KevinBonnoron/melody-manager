import { useEffect, useState } from 'react';
import { pluginsClient } from '@/clients/plugins.client';
import type { PluginManifest } from '@/shared';

let cachedManifests: PluginManifest[] | null = null;
let inFlight: Promise<PluginManifest[]> | null = null;
const listeners = new Set<(manifests: PluginManifest[]) => void>();
let latest = 0;

function fetchManifests(): Promise<PluginManifest[]> {
  const ticket = ++latest;
  // Through the shared client, which attaches the auth token: /api/plugins sits
  // behind the same authentication as the rest of the API.
  const request = pluginsClient
    .list()
    .then((data: PluginManifest[]) => {
      // An answer that was already on its way must not replace a newer one: a
      // forced refresh exists precisely because the request in flight predates
      // the write that asked for it.
      if (ticket === latest) {
        cachedManifests = data;
        for (const listener of listeners) {
          listener(data);
        }
      }
      return data;
    })
    .finally(() => {
      if (inFlight === request) {
        inFlight = null;
      }
    });

  inFlight = request;
  return request;
}

function load(force = false): Promise<PluginManifest[]> {
  if (!force) {
    if (cachedManifests) {
      return Promise.resolve(cachedManifests);
    }
    return inFlight ?? fetchManifests();
  }

  // Joining the request in flight would answer with what the server knew before
  // the write, so the new one starts once that one is out of the way.
  return (inFlight ?? Promise.resolve()).catch(() => undefined).then(() => fetchManifests());
}

// A manifest carries what the server-level config still lacks, so writing that
// config changes it. Without this the screens keep the answer they were given
// on the first render, and saving a path appears to do nothing.
//
// A refresh that fails leaves a stale answer on the screens; it does not undo
// the write that asked for it, so it must not be reported as a failed save.
export async function refreshPluginsAfterWrite(): Promise<void> {
  try {
    await load(true);
  } catch (error) {
    console.error('Failed to refresh plugin manifests:', error);
  }
}

export function usePlugins() {
  const [manifests, setManifests] = useState<PluginManifest[]>(cachedManifests ?? []);
  const [loading, setLoading] = useState(cachedManifests === null);
  useEffect(() => {
    listeners.add(setManifests);
    load()
      .then(setManifests)
      .catch((err) => {
        console.error('Failed to fetch plugin manifests:', err);
      })
      .finally(() => setLoading(false));

    return () => {
      listeners.delete(setManifests);
    };
  }, []);

  return { manifests, loading };
}

export function usePluginManifest(pluginId: string) {
  const { manifests, loading } = usePlugins();
  return {
    manifest: manifests.find((m) => m.id === pluginId),
    loading,
  };
}
