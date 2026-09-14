import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { providerCollection } from '@/collections/provider.collection';
import { getDeviceProviders } from '@/components/sources/source-status';
import type { Provider } from '@/shared';

// Every kind of device, switched on or not.
//
// Deliberately unfiltered, unlike the sources: a source is turned off by
// disconnecting it and stays on the screen either way, while a device source is
// turned off by a switch. Hiding the ones that are off would take the switch off
// the screen with them, and the only way back would be the database.
export function useDeviceProviders() {
  const { data: providers = [] } = useLiveQuery({ query: (q) => q.from({ providers: providerCollection }) });
  return useMemo(() => getDeviceProviders(providers as Provider[]), [providers]);
}
