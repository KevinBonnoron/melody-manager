import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type PlayheadSource, usePlayhead } from '@/hooks/use-playhead';
import { useTrackPeaks } from '@/hooks/use-track-peaks';
import { cn, formatDuration } from '@/lib/utils';

const BAR_WIDTH = 2;
const BAR_GAP = 1;
const PLACEHOLDER_BAR = 0.3;

interface Chapter {
  startTime: number;
  title: string;
}

interface Props extends PlayheadSource {
  trackId?: string;
  chapters?: Chapter[];
  onSeek: (time: number) => void;
}

export function ProgressBar({ trackId, chapters = [], onSeek, ...source }: Props) {
  const { t } = useTranslation();
  const { currentTime, duration } = source;
  const { peaks, loading } = useTrackPeaks(trackId, true);

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
  usePlayhead(
    source,
    useCallback((ratio: number) => {
      if (fillRef.current) {
        fillRef.current.style.width = `${ratio * 100}%`;
      }
    }, []),
  );

  if (duration <= 0) {
    return null;
  }

  const seekTo = (clientX: number, rect: DOMRect) => {
    if (rect.width > 0) {
      onSeek(Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration)));
    }
  };

  const pending = loading;
  const at = `${Math.min(1, Math.max(0, currentTime / duration)) * 100}%`;

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">{formatDuration(currentTime)}</span>
      <div
        ref={trackRef}
        className="group relative h-7 flex-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        role="slider"
        tabIndex={0}
        aria-label={t('MusicPlayer.seek')}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onClick={(event) => seekTo(event.clientX, event.currentTarget.getBoundingClientRect())}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 5;
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            onSeek(Math.min(currentTime + step, duration));
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onSeek(Math.max(currentTime - step, 0));
          }
        }}
      >
        {bars.length > 0 ? (
          <>
            <Shape bars={bars} className="text-muted-foreground/40" pending={pending} />
            <div ref={fillRef} className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden" style={{ width: at }}>
              <Shape bars={bars} className="text-primary" width={bars.length * (BAR_WIDTH + BAR_GAP)} pending={pending} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <div ref={fillRef} className="h-full rounded-full bg-primary" style={{ width: at }} />
            </div>
          </div>
        )}

        {chapters.map((chapter) => (
          <Tooltip key={chapter.startTime}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('MusicPlayer.jumpToChapter', { title: chapter.title, at: formatDuration(chapter.startTime) })}
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 cursor-pointer bg-foreground/40 hover:bg-foreground/60"
                style={{ left: `${(chapter.startTime / duration) * 100}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(chapter.startTime);
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{chapter.title}</p>
              <p className="text-xs text-muted-foreground">{formatDuration(chapter.startTime)}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <span className="w-10 shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
    </div>
  );
}

function Shape({ bars, className, width, pending }: { bars: number[]; className: string; width?: number; pending?: boolean }) {
  return (
    <div className={cn('flex h-full items-center', className, pending && 'animate-pulse')} style={{ width: width ? `${width}px` : undefined, gap: `${BAR_GAP}px` }}>
      {bars.map((value, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are a fixed-length resampling, position is the identity
          key={index}
          className="shrink-0 rounded-[1px] bg-current"
          style={{ width: `${BAR_WIDTH}px`, height: `${Math.max(1, value * 100)}%` }}
        />
      ))}
    </div>
  );
}
