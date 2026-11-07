import type { PlayerState, Track } from '@/shared';

/**
 * queueOf is the list in the order it is played, not the order it was given.
 * Entries the library cannot resolve are left out rather than shown as holes,
 * and an order that has drifted from its list does not throw.
 */
export function queueOf(state: Pick<PlayerState, 'list' | 'order'>, tracksById: Map<string, Track>): Track[] {
  const out: Track[] = [];
  for (const at of state.order) {
    const track = tracksById.get(state.list[at]);
    if (track) {
      out.push(track);
    }
  }
  return out;
}
