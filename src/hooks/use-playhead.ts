import { useEffect, useLayoutEffect, useRef } from 'react';

export interface PlayheadSource {
  currentTime: number;
  duration: number;
  playing?: boolean;
  loading?: boolean;
  media?: HTMLAudioElement | null;
}

export function usePlayhead({ currentTime, duration, playing = false, loading = false, media }: PlayheadSource, paint: (ratio: number) => void) {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const reported = useRef({ time: currentTime, at: performance.now() });
  useLayoutEffect(() => {
    reported.current = { time: currentTime, at: performance.now() };
  }, [currentTime]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the position is read from a ref, currentTime is the signal that a new one has arrived
  useEffect(() => {
    const show = (time: number) => paintRef.current(duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0);
    const at = () => (media ? media.currentTime : reported.current.time + (performance.now() - reported.current.at) / 1000);

    if (!playing || loading) {
      show(media ? media.currentTime : reported.current.time);
      return;
    }

    let frame = requestAnimationFrame(function step() {
      show(at());
      frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  }, [playing, loading, duration, currentTime, media]);
}
