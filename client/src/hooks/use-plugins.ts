import { config } from '@/lib/env';
import type { PluginManifest } from '@melody-manager/shared';
import { useEffect, useState } from 'react';

let cachedManifests: PluginManifest[] | null = null;

export function usePlugins() {
  const [manifests, setManifests] = useState<PluginManifest[]>(cachedManifests ?? []);
  const [loading, setLoading] = useState(cachedManifests === null);

  useEffect(() => {
    if (cachedManifests) {
      return;
    }

    fetch(`${config.server.url}/plugins`)
      .then((res) => res.json())
      .then((data: PluginManifest[]) => {
        cachedManifests = data;
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
