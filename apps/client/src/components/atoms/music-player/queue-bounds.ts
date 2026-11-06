import type { Track } from '@/shared';

interface Args {
  queue: Track[];
  trackId?: string;
  repeatMode: 'none' | 'one' | 'all';
}

/** Whether the transport can leave this track. */
export function queueBounds({ queue, trackId, repeatMode }: Args): { canGoNext: boolean; canGoPrevious: boolean } {
  const index = queue.findIndex((track) => track.id === trackId);
  const loops = repeatMode === 'all' && queue.length > 0;
  return { canGoNext: (index >= 0 && index < queue.length - 1) || loops, canGoPrevious: index > 0 || loops };
}
