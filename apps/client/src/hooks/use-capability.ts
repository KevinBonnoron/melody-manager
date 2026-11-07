import { useCallback } from 'react';
import { usePlugins } from './use-plugins';

export interface CapabilityState {
  available: boolean;
  missing: string[];
}

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

export function useMissingFieldLabels() {
  const { manifests } = usePlugins();

  return useCallback((providerType: string, missing: string[]): string[] => missing.map((name) => manifests.find((m) => m.id === providerType)?.configSchema?.find((f) => f.name === name)?.label ?? name), [manifests]);
}
