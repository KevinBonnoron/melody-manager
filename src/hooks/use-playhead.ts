import { useEffect, useRef, useState } from 'react';
import type { Playhead } from '@/lib/playhead';
import { serverNow } from '@/lib/server-clock';

/**
 * usePlayheadTime is the playhead for something that shows a time, ticked when
 * the second it would display changes rather than on every frame.
 */
export function usePlayheadTime(playhead: Playhead): number {
  const [at, setAt] = useState(() => playhead.read(serverNow()));

  useEffect(() => {
    const now = playhead.read(serverNow());
    setAt(now);

    if (!playhead.advancing) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const nextSecond = (from: number) => {
      timer = setTimeout(
        () => {
          const reached = playhead.read(serverNow());
          setAt(reached);
          nextSecond(reached);
        },
        Math.max(16, 1000 - ((from * 1000) % 1000)),
      );
    };

    nextSecond(now);
    return () => clearTimeout(timer);
  }, [playhead]);

  return at;
}

/** usePlayhead paints the playhead every frame, from the same reading. */
export function usePlayhead(playhead: Playhead, paint: (ratio: number) => void) {
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const show = () => {
      const at = playhead.read(serverNow());
      paintRef.current(playhead.duration > 0 ? Math.min(1, Math.max(0, at / playhead.duration)) : 0);
    };

    if (!playhead.advancing || playhead.loading) {
      show();
      return;
    }

    let frame = requestAnimationFrame(function step() {
      show();
      frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  }, [playhead]);
}
