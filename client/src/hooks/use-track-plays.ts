import { useCallback, useEffect, useMemo, useState } from 'react';
import { config } from '@/lib/config';
import { pb } from '@/lib/pocketbase';

export function useTrackPlays() {
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch(`${config.server.url}/stats/play-counts`, {
          headers: { Authorization: `Bearer ${pb.authStore.token}` },
        });
        if (response.ok) {
          setPlayCounts(await response.json());
        }
      } catch (error) {
        console.warn('Failed to fetch play counts:', error);
      }
    };

    fetchCounts();

    // Subscribe to track_plays changes to refresh counts
    const unsubscribe = pb.collection('track_plays').subscribe('*', () => {
      fetchCounts();
    });

    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, []);

  const playCountMap = useMemo(() => new Map(Object.entries(playCounts)), [playCounts]);

  const getPlayCount = useCallback(
    (trackId: string) => {
      return playCountMap.get(trackId) ?? 0;
    },
    [playCountMap],
  );

  return { getPlayCount };
}
