import { useEffect, useState } from 'react';
import { tracksClient } from '@/clients/tracks.client';

interface TrackPeaks {
  peaks: number[];
  loading: boolean;
}

const NONE: TrackPeaks = { peaks: [], loading: false };

export function useTrackPeaks(trackId: string | undefined, wanted: boolean): TrackPeaks {
  const [state, setState] = useState<TrackPeaks>(NONE);

  useEffect(() => {
    if (!trackId || !wanted) {
      setState(NONE);
      return;
    }

    setState({ peaks: [], loading: true });

    let stale = false;
    tracksClient
      .getPeaks(trackId)
      .then((res) => {
        if (!stale) {
          setState({ peaks: res.peaks ?? [], loading: false });
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
