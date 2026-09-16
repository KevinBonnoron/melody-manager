import { useEffect, useState } from 'react';
import { pluginsClient } from '@/clients/plugins.client';
import type { PluginManifest } from '@/shared';

let cachedManifests: PluginManifest[] | null = null;
let inFlight: Promise<PluginManifest[]> | null = null;
const listeners = new Set<(manifests: PluginManifest[]) => void>();
let latest = 0;

function fetchManifests(): Promise<PluginManifest[]> {
  const ticket = ++latest;
  const request = pluginsClient
    .list()
    .then((data: PluginManifest[]) => {
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

  return (inFlight ?? Promise.resolve()).catch(() => undefined).then(() => fetchManifests());
}

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
