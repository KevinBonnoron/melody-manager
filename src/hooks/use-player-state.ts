import { useMemo, useSyncExternalStore } from 'react';
import { queueOf } from '@/lib/play-order';
import { empty, ready, snapshot, subscribe } from '@/lib/player-state';
import type { PlayerState, Track } from '@/shared';

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot, empty);
}

/**
 * usePlayerRead says whether the record has been read yet. An empty state
 * before that means "not known", which is not the same as "nothing is playing"
 * and must not be acted on.
 */
export function usePlayerRead(): boolean {
  return useSyncExternalStore(subscribe, ready, () => false);
}

export function usePlayerQueue(state: PlayerState, tracksById: Map<string, Track>): Track[] {
  return useMemo(() => queueOf(state, tracksById), [state, tracksById]);
}
