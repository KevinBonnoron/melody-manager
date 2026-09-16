import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { providerCollection } from '@/collections/provider.collection';
import { getDeviceProviders } from '@/components/sources/source-status';
import type { Provider } from '@/shared';

export function useDeviceProviders() {
  const { data: providers = [] } = useLiveQuery({ query: (q) => q.from({ providers: providerCollection }) });
  return useMemo(() => getDeviceProviders(providers as Provider[]), [providers]);
}
