import { useEffect, useState } from 'react';
import { tracksClient } from '@/clients/tracks.client';
import { cachedValue, type TimedCache, type TimedCacheLimits, writeCache } from './timed-cache';

interface TrackPeaks {
  peaks: number[];
  loading: boolean;
}

const NONE: TrackPeaks = { peaks: [], loading: false };

// A track's waveform does not change, so what is held is only ever dropped to
// keep the map from growing.
const LIMITS: TimedCacheLimits = { ttlMs: Number.POSITIVE_INFINITY, maxEntries: 200 };

const held: TimedCache<number[]> = new Map();

// Two progress bars on screen ask for the same waveform at the same moment, and
// so does a second mount of the same one. They share the request rather than
// each making it.
const asking = new Map<string, Promise<number[]>>();

function peaksOf(trackId: string): Promise<number[]> {
  const pending = asking.get(trackId);
  if (pending) {
    return pending;
  }

  const request = tracksClient
    .getPeaks(trackId)
    .then((res) => {
      const peaks = res.peaks ?? [];
      writeCache(held, trackId, peaks, Date.now(), LIMITS);
      return peaks;
    })
    .finally(() => {
      if (asking.get(trackId) === request) {
        asking.delete(trackId);
      }
    });

  asking.set(trackId, request);
  return request;
}

export function useTrackPeaks(trackId: string | undefined, wanted: boolean): TrackPeaks {
  const [state, setState] = useState<TrackPeaks>(NONE);

  useEffect(() => {
    if (!trackId || !wanted) {
      setState(NONE);
      return;
    }

    const known = cachedValue(held, trackId);
    if (known) {
      setState({ peaks: known, loading: false });
      return;
    }

    setState({ peaks: [], loading: true });

    let stale = false;
    peaksOf(trackId)
      .then((peaks) => {
        if (!stale) {
          setState({ peaks, loading: false });
        }
      })
      .catch(() => {
        if (!stale) {
          setState(NONE);
        }
      });

    return () => {
      stale = true;
    };
  }, [trackId, wanted]);

  return state;
}
