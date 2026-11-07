import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { trackCollection } from '@/collections/track.collection';
import { getSourceStatus, getTrackProviders, isSourceInUse } from '@/components/sources/source-status';
import type { Connection, Provider, Track } from '@/shared';
import { useAuthUser } from './use-auth-user';
import { usePlugins } from './use-plugins';

export function useActiveSources() {
  const user = useAuthUser();
  const { manifests } = usePlugins();
  const { data: providers = [] } = useLiveQuery({ query: (q) => q.from({ providers: providerCollection }).where(({ providers }) => eq(providers.enabled, true)) });
  const { data: connections = [] } = useLiveQuery({ query: (q) => q.from({ connections: connectionCollection }).where(({ connections }) => eq(connections.user, user.id)) });
  const { data: tracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });

  const countByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of tracks as Track[]) {
      counts.set(track.source, (counts.get(track.source) ?? 0) + 1);
    }

    return counts;
  }, [tracks]);

  const linkedTypes = useMemo(() => new Set((connections as Connection[]).map((c) => c.type)), [connections]);
  const trackProviders = useMemo(() => getTrackProviders(providers as Provider[]), [providers]);

  return useMemo(() => {
    const statusOf = (type: string) => getSourceStatus(type, manifests, linkedTypes, (countByType.get(type) ?? 0) > 0);
    return {
      trackProviders,
      statusOf,
      countByType,
      totalTracks: tracks.length,
      active: trackProviders.filter((p) => isSourceInUse(statusOf(p.type))),
      available: trackProviders.filter((p) => !isSourceInUse(statusOf(p.type))),
    };
  }, [trackProviders, manifests, linkedTypes, countByType, tracks.length]);
}
