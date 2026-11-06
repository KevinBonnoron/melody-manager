import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePlayhead, usePlayheadTime } from '@/hooks/use-playhead';
import { useTrackPeaks } from '@/hooks/use-track-peaks';
import type { Playhead } from '@/lib/playhead';
import { cn, formatDuration } from '@/lib/utils';
import type { ProgressShape, WaveStyle } from '@/providers/ThemeProvider';
import { useTheme } from '@/providers/ThemeProvider';

const BAR_WIDTH = 2;
const BAR_GAP = 1;
const PLACEHOLDER_BAR = 0.3;

interface Chapter {
  startTime: number;
  title: string;
}

interface Props {
  playhead: Playhead;
  trackId?: string;
  chapters?: Chapter[];
  onSeek: (time: number) => void;
}

export function ProgressBar({ playhead, trackId, chapters = [], onSeek }: Props) {
  const { t } = useTranslation();
  const { progressShape, progressCursor, waveStyle } = useTheme();
  const currentTime = usePlayheadTime(playhead);
  const { duration } = playhead;
  const drawn = progressShape !== 'plain';
  const { peaks, loading } = useTrackPeaks(trackId, drawn);

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
    if (!drawn || barCount === 0) {
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
  }, [drawn, peaks, barCount]);

  const fillRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  usePlayhead(
    playhead,
    useCallback((ratio: number) => {
      if (fillRef.current) {
        fillRef.current.style.width = `${ratio * 100}%`;
      }
      if (cursorRef.current) {
        cursorRef.current.style.left = `${ratio * 100}%`;
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
  const position = Math.min(Math.max(currentTime, 0), duration);
  const at = `${duration > 0 ? (position / duration) * 100 : 0}%`;

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">{formatDuration(position)}</span>
      <div className="relative h-7 flex-1">
        <div
          ref={trackRef}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          role="slider"
          tabIndex={0}
          aria-label={t('MusicPlayer.seek')}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={position}
          onClick={(event) => seekTo(event.clientX, event.currentTarget.getBoundingClientRect())}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 5;
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              onSeek(Math.min(position + step, duration));
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              onSeek(Math.max(position - step, 0));
            }
          }}
        >
          {bars.length > 0 ? (
            <>
              <Shape bars={bars} shape={progressShape} waveStyle={waveStyle} className="text-muted-foreground/40" pending={pending} />
              <div ref={fillRef} className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden" style={{ width: at }}>
                <Shape bars={bars} shape={progressShape} waveStyle={waveStyle} className="text-primary" width={bars.length * (BAR_WIDTH + BAR_GAP)} pending={pending} />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
                <div ref={fillRef} className="h-full rounded-full bg-primary" style={{ width: at }} />
              </div>
            </div>
          )}

          {progressCursor && bars.length > 0 && <div ref={cursorRef} className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: at }} />}
        </div>

        {chapters.map((chapter) => (
          <Tooltip key={chapter.startTime}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('MusicPlayer.jumpToChapter', { title: chapter.title, at: formatDuration(chapter.startTime) })}
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 cursor-pointer bg-foreground/40 hover:bg-foreground/60"
                style={{ left: `${(chapter.startTime / duration) * 100}%` }}
                onClick={() => onSeek(chapter.startTime)}
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

function Shape({ bars, shape, waveStyle, className, width, pending }: { bars: number[]; shape: ProgressShape; waveStyle: WaveStyle; className: string; width?: number; pending?: boolean }) {
  const style = { width: width ? `${width}px` : undefined };

  if (shape === 'wave') {
    const span = bars.length * (BAR_WIDTH + BAR_GAP);
    const x = (index: number) => index * (BAR_WIDTH + BAR_GAP);
    const height = (value: number) => Math.max(1, value * 100);
    const up = bars.map((value, index) => `${x(index)},${50 - height(value) / 2}`).join(' ');
    const down = bars.map((value, index) => `${x(index)},${50 + height(value) / 2}`).join(' ');
    const outline = bars.map((_, index) => `${x(bars.length - 1 - index)},${50 + height(bars[bars.length - 1 - index]) / 2}`).join(' ');

    return (
      <svg className={cn('h-full', width === undefined && 'w-full', className, pending && 'animate-pulse')} style={style} viewBox={`0 0 ${span} 100`} preserveAspectRatio="none" aria-hidden="true" role="presentation">
        {waveStyle === 'stroked' ? (
          <>
            <polyline points={up} fill="none" stroke="currentColor" strokeWidth={4} vectorEffect="non-scaling-stroke" />
            <polyline points={down} fill="none" stroke="currentColor" strokeWidth={4} vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <polygon points={`${up} ${outline}`} className="fill-current" />
        )}
      </svg>
    );
  }

  return (
    <div className={cn('flex h-full', shape === 'columns' ? 'items-end' : 'items-center', className, pending && 'animate-pulse')} style={{ ...style, gap: `${BAR_GAP}px` }}>
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
