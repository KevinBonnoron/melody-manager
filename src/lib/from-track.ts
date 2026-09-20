import type { Track } from '@/shared';

/**
 * What to hand the player when a track is clicked in a list: that track and the
 * ones after it, since clicking the third of an album asks for the third
 * onwards rather than for the album from its start.
 */
export function fromTrack(track: Track, context: Track[]): Track[] {
  const at = context.findIndex((other) => other.id === track.id);
  return at < 0 ? [track] : context.slice(at);
}
