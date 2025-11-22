import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMusicPlayer } from '@/contexts/music-player-context';

export function ProgressBar() {
  const { currentTrack, currentTime, seek } = useMusicPlayer();
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  if (!currentTrack) {
    return null;
  }

  const progress = currentTrack.duration > 0 ? (currentTime / currentTrack.duration) * 100 : 0;
  const displayProgress = isDragging ? dragValue : progress;
  const chapters = currentTrack.metadata?.chapters || [];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground w-12 text-right">{formatTime(isDragging ? (dragValue / 100) * currentTrack.duration : currentTime)}</span>
      <div className="relative flex-1">
        <Slider
          value={[displayProgress]}
          max={100}
          step={0.1}
          onValueChange={([value]) => {
            setIsDragging(true);
            setDragValue(value);
          }}
          onValueCommit={([value]) => {
            setIsDragging(false);
            const newTime = (value / 100) * currentTrack.duration;
            seek(newTime);
          }}
          className="flex-1"
        />
        {chapters.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-full pointer-events-none">
            {chapters.map((chapter, index) => {
              const position = (chapter.startTime / currentTrack.duration) * 100;
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div
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
      <span className="text-xs text-foreground w-12">{formatTime(currentTrack.duration)}</span>
    </div>
  );
}
