import type { PluginManifest } from '@melody-manager/shared';
import { useEffect, useState } from 'react';
import { config } from '@/lib/config';

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
      cachedManifestsPromise = fetch(`${config.server.url}/plugins`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch plugins');
          }

          return res.json();
        })
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
