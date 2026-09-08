import { useEffect, useState } from 'react';
import { pluginsClient } from '@/clients/plugins.client';
import type { PluginManifest } from '@/shared';

let cachedManifests: PluginManifest[] | null = null;
let cachedManifestsPromise: Promise<PluginManifest[]> | null = null;
export function usePlugins() {
  const [manifests, setManifests] = useState<PluginManifest[]>(cachedManifests ?? []);
  const [loading, setLoading] = useState(cachedManifests === null);
  useEffect(() => {
    if (cachedManifests) {
      return;
    }

    if (!cachedManifestsPromise) {
      // Through the shared client, which attaches the auth token: /api/plugins
      // sits behind the same authentication as the rest of the API.
      cachedManifestsPromise = pluginsClient
        .list()
        .then((data: PluginManifest[]) => {
          cachedManifests = data;
          return data;
        })
        .finally(() => {
          cachedManifestsPromise = null;
        });
    }

    cachedManifestsPromise
      .then((data) => {
        setManifests(data);
      })
      .catch((err) => {
        console.error('Failed to fetch plugin manifests:', err);
      })
      .finally(() => setLoading(false));
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
