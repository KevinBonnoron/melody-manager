import { reached } from './clock';

/**
 * A playhead is one answer to "where is it now", asked at whatever rate the
 * asker needs: once a second for a displayed time, once a frame for a cursor.
 * Two readers each keeping their own idea of where it is drift apart, and the
 * drift shows as a cursor that walks away from its own label.
 */
export interface Playhead {
  read: (now: number) => number;
  duration: number;
  advancing: boolean;
  loading: boolean;
}

export function playheadOf(source: { position: number; positionAt: string; duration: number; advancing: boolean; loading: boolean; media: HTMLMediaElement | null }): Playhead {
  const { position, positionAt, duration, advancing, loading, media } = source;
  return {
    duration,
    advancing,
    loading,
    read: (now: number) => (media ? media.currentTime : reached(position, positionAt, advancing, now)),
  };
}
