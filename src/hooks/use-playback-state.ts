import { eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback, useRef } from 'react';
import { playbackStateCollection } from '@/collections/playback-state.collection';
import { config } from '@/lib/config';
import { pb } from '@/lib/pocketbase';
import type { PlaybackState } from '@/shared';
import { useAuthUser } from './use-auth-user';
import { useTracksById } from './use-library-index';

export function usePlaybackState() {
  const user = useAuthUser();
  const tracksById = useTracksById();
  const { data: rows = [], isLoading } = useLiveQuery({ query: (q) => q.from({ states: playbackStateCollection }).where(({ states }) => eq(states.user, user.id)) });
  const state = (rows as unknown as PlaybackState[])[0];
  const stateRef = useRef<PlaybackState | undefined>(undefined);
  stateRef.current = state;
  const insertingRef = useRef(false);

  const save = useCallback(
    (trackId: string, position: number, queue: string[]) => {
      const current = stateRef.current;
      if (current) {
        const queueChanged = (current.queue ?? []).join(',') !== queue.join(',');
        if (!queueChanged && current.track === trackId && Math.abs(current.position - position) < 1) {
          return;
        }

        playbackStateCollection.update(current.id, (draft) => {
          draft.track = trackId;
          draft.position = position;
          if (queueChanged) {
            draft.queue = queue;
          }
        });
        return;
      }

      // The row is unique per user, so a second insert would be rejected
      // server-side; an unsynced collection is not proof there is none yet.
      if (insertingRef.current || isLoading) {
        return;
      }

      insertingRef.current = true;
      const tx = playbackStateCollection.insert({ id: playbackStateCollection.utils.newId(), user: user.id, track: trackId, position, queue } as PlaybackState);
      tx.isPersisted.promise
        .catch((error) => {
          console.error('Failed to save playback position:', error);
        })
        .finally(() => {
          insertingRef.current = false;
        });
    },
    [isLoading, user.id],
  );

  // A page being unloaded has no time for the normal write path, and losing it
  // is exactly what makes a resume land seconds off.
  const flush = useCallback((trackId: string, position: number) => {
    const current = stateRef.current;
    if (!current) {
      return;
    }

    try {
      fetch(`${config.server.url}/api/collections/playback_state/records/${current.id}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ track: trackId, position }),
      });
    } catch (error) {
      console.error('Failed to flush playback position:', error);
    }
  }, []);

  return {
    flush,
    position: state?.position ?? 0,
    track: state ? tracksById.get(state.track) : undefined,
    queueIds: state?.queue ?? [],
    save,
  };
}
