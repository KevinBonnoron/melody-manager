import { tracksClient } from '@/clients/tracks.client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

export function ProgressBar() {
  const { currentTrack, currentTime, seek, audioElement } = useMusicPlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }
    let stale = false;
    setPeaks(null);
    tracksClient
      .getPeaks(currentTrack.id)
      .then((res) => {
        if (!stale) {
          setPeaks(res.peaks);
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
  }, [currentTrack]);

  useEffect(() => {
    if (!containerRef.current || !audioElement || !currentTrack || !peaks?.length) {
      return;
    }

    wavesurferRef.current?.destroy();

    const getColor = (className: string) => {
      const el = document.createElement('div');
      el.className = className;
      el.style.display = 'none';
      document.body.appendChild(el);
      const color = getComputedStyle(el).color;
      document.body.removeChild(el);
      return color || undefined;
    };
    const primaryColor = getColor('text-primary') ?? '#6366f1';
    const mutedColor = getColor('text-muted-foreground') ?? '#9ca3af';

    const ws = WaveSurfer.create({
      container: containerRef.current,
      media: audioElement,
      peaks: peaks.length > 0 ? [peaks] : undefined,
      duration: currentTrack.duration,
      height: 28,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      waveColor: mutedColor,
      progressColor: primaryColor,
      cursorWidth: 0,
      interact: true,
      normalize: true,
    });

    ws.on('interaction', (newTime) => {
      seekRef.current(newTime);
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [currentTrack, audioElement, peaks]);

  if (!currentTrack) {
    return null;
  }

  const chapters = currentTrack.metadata?.chapters ?? [];

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0 ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = currentTrack.duration > 0 ? (currentTime / currentTrack.duration) * 100 : 0;

  const handleSimpleBarClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(ratio * currentTrack.duration);
  };

  return (
    <div className="relative w-full min-h-[28px]">
      {peaks === null || peaks.length === 0 ? (
        <button type="button" className="mx-10 h-[28px] w-[calc(100%-5rem)] flex items-center cursor-pointer" onClick={handleSimpleBarClick} aria-label="Seek playback position">
          <div className="relative w-full h-1 bg-muted-foreground/30 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-none" style={{ width: `${progressPercent}%` }} />
          </div>
        </button>
      ) : (
        <div
          ref={containerRef}
          className="cursor-pointer mx-10 [&_canvas]:!bg-transparent"
          aria-label="Waveform seek bar"
          role="slider"
          tabIndex={0}
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={currentTrack.duration || 0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 5;
            if (e.key === 'ArrowRight') {
              seek(Math.min(currentTime + step, currentTrack.duration));
            } else if (e.key === 'ArrowLeft') {
              seek(Math.max(currentTime - step, 0));
            }
          }}
        />
      )}
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none tabular-nums">{formatTime(currentTime)}</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none tabular-nums">{formatTime(currentTrack.duration)}</span>
      {chapters.length > 0 && (
        <div className="absolute top-0 left-0 right-0 h-full pointer-events-none">
          {chapters.map((chapter) => {
            const position = currentTrack.duration > 0 ? (chapter.startTime / currentTrack.duration) * 100 : 0;
            return (
              <Tooltip key={chapter.startTime}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Jump to chapter ${chapter.title} at ${formatTime(chapter.startTime)}`}
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-foreground/40 pointer-events-auto cursor-pointer hover:bg-foreground/60"
                    style={{ left: `${position}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(chapter.startTime);
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{chapter.title}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(chapter.startTime)}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
