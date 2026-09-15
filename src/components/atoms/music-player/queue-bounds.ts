import type { Track } from '@/shared';

interface Args {
  queue: Track[];
  trackId?: string;
  repeatMode: 'none' | 'one' | 'all';
  // A device playing on its own says nothing about what it holds, so both ways
  // stay open and the command is the device's to answer.
  remote: boolean;
}

/**
 * Whether the transport can leave this track. The rule belongs to the queue, so
 * the bar and the picture-in-picture window read it here rather than each
 * writing it out.
 */
export function queueBounds({ queue, trackId, repeatMode, remote }: Args): { canGoNext: boolean; canGoPrevious: boolean } {
  if (remote) {
    return { canGoNext: true, canGoPrevious: true };
  }

  const index = queue.findIndex((track) => track.id === trackId);
  const loops = repeatMode === 'all' && queue.length > 0;
  return { canGoNext: (index >= 0 && index < queue.length - 1) || loops, canGoPrevious: index > 0 || loops };
}
