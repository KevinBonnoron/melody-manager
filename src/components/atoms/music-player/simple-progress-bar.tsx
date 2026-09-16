import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tracksClient } from '@/clients/tracks.client';
import { formatDuration } from '@/lib/utils';

const BAR_WIDTH = 2;
const BAR_GAP = 1;

const PLACEHOLDER_BAR = 0.3;

interface Props {
  trackId?: string;
  currentTime: number;
  duration: number;
  playing?: boolean;
  loading?: boolean;
  onSeek: (time: number) => void;
}

export function SimpleProgressBar({ trackId, currentTime, duration, playing = false, loading = false, onSeek }: Props) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [barCount, setBarCount] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const trackRef = useCallback((element: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) {
      return;
    }

    const measure = () => setBarCount(Math.max(0, Math.floor(element.clientWidth / (BAR_WIDTH + BAR_GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    if (!trackId) {
      setPeaks([]);
      return;
    }

    let stale = false;
    tracksClient
      .getPeaks(trackId)
      .then((res) => {
        if (!stale) {
          setPeaks(res.peaks ?? []);
        }
      })
      .catch(() => {
        if (!stale) {
          setPeaks([]);
        }
      });
    return () => {
      stale = true;
    };
  }, [trackId]);

  const bars = useMemo(() => {
    if (barCount === 0) {
      return [];
    }

    if (peaks.length === 0) {
      return Array.from({ length: barCount }, () => PLACEHOLDER_BAR);
    }

    const step = peaks.length / barCount;
    const loudest = Math.max(...peaks.map(Math.abs), 0.0001);
    return Array.from({ length: barCount }, (_, i) => {
      const from = Math.floor(i * step);
      const to = Math.max(from + 1, Math.floor((i + 1) * step));
      let max = 0;
      for (let j = from; j < to && j < peaks.length; j++) {
        max = Math.max(max, Math.abs(peaks[j]));
      }

      return max / loudest;
    });
  }, [peaks, barCount]);

  const fillRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef({ time: currentTime, at: performance.now() });
  useLayoutEffect(() => {
    baseRef.current = { time: currentTime, at: performance.now() };
  }, [currentTime]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the position is read from a ref, currentTime is the change signal that has to repaint a bar nothing else is animating
  useEffect(() => {
    const paint = (time: number) => {
      if (fillRef.current) {
        fillRef.current.style.width = `${(duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0) * 100}%`;
      }
    };

    if (!playing || loading) {
      paint(baseRef.current.time);
      return;
    }

    let frame = 0;
    const step = () => {
      paint(baseRef.current.time + (performance.now() - baseRef.current.at) / 1000);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, loading, duration, currentTime]);

  if (duration <= 0) {
    return null;
  }

  const seekFromEvent = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || duration <= 0) {
      return;
    }

    onSeek(Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration)));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">{formatDuration(currentTime)}</span>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the transport buttons carry the keyboard path */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: seeking is a pointer gesture on the track */}
      <div ref={trackRef} className="group relative h-7 flex-1 cursor-pointer" onClick={seekFromEvent}>
        {bars.length > 0 ? (
          <>
            <Waveform bars={bars} className="bg-muted-foreground/40" pending={peaks.length === 0} />
            <div ref={fillRef} className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden" style={{ width: 0 }}>
              <Waveform bars={bars} className="bg-primary" width={bars.length * (BAR_WIDTH + BAR_GAP)} pending={peaks.length === 0} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <div ref={fillRef} className="h-full rounded-full bg-primary" style={{ width: 0 }} />
            </div>
          </div>
        )}
      </div>
      <span className="w-10 shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
    </div>
  );
}

function Waveform({ bars, className, width, pending }: { bars: number[]; className: string; width?: number; pending?: boolean }) {
  return (
    <div className={`flex h-full items-center ${pending ? 'animate-pulse' : ''}`} style={{ gap: `${BAR_GAP}px`, width: width ? `${width}px` : undefined }}>
      {bars.map((value, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are a fixed-length resampling, position is the identity
          key={index}
          className={`shrink-0 rounded-[1px] ${className}`}
          style={{ width: `${BAR_WIDTH}px`, height: `${Math.max(1, value * 100)}%` }}
        />
      ))}
    </div>
  );
}
