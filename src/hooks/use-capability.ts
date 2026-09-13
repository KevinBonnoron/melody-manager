import { useCallback } from 'react';
import { usePlugins } from './use-plugins';

export interface CapabilityState {
  available: boolean;
  // Config fields the admin still has to fill, by name. Empty when available.
  missing: string[];
}

// Whether a source can do something, and what is missing when it cannot. The
// answer comes from the API: the manifest declares the requirements, but only
// the server can see whether they are satisfied.
export function useCapability() {
  const { manifests } = usePlugins();

  return useCallback(
    (providerType: string, capability: string): CapabilityState => {
      const missing = manifests.find((m) => m.id === providerType)?.unavailable?.[capability] ?? [];
      return { available: missing.length === 0, missing };
    },
    [manifests],
  );
}

// Human-readable label of a missing field, from the manifest's own schema.
export function useMissingFieldLabels() {
  const { manifests } = usePlugins();

  return useCallback((providerType: string, missing: string[]): string[] => missing.map((name) => manifests.find((m) => m.id === providerType)?.configSchema?.find((f) => f.name === name)?.label ?? name), [manifests]);
}
