import { Button } from '@/components/ui/button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@melody-manager/shared';
import { Loader2, Pause, Play } from 'lucide-react';

interface Props {
  index: number;
  track: Track;
  contextTracks: Track[];
}

export function TrackIndexButton({ index, track, contextTracks }: Props) {
  const { currentTrack, isPlaying, isLoading, playTrackWithContext, togglePlayPause } = useMusicPlayer();
  const isCurrentTrack = currentTrack?.id === track.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;
  const isCurrentlyLoading = isCurrentTrack && isLoading;

  function handleClick() {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrackWithContext(track, contextTracks);
    }
  }

  const defaultContent = () => {
    if (isCurrentlyLoading) {
      return <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />;
    }
    if (isCurrentlyPlaying) {
      return <Pause className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground group-hover:opacity-0 transition-[opacity]" fill="currentColor" />;
    }
    return <span className={`text-sm absolute inset-0 flex items-center justify-center transition-opacity ${isCurrentTrack ? 'text-primary' : ''} group-hover:opacity-0`}>{index}</span>;
  };

  const hoverContent = () => {
    if (isCurrentlyLoading) return null;
    return (
      <Button size="icon" variant="ghost" className="h-8 w-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity opacity-0 group-hover:opacity-100 text-primary hover:!bg-transparent hover:!text-primary" onClick={handleClick}>
        {isCurrentlyPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
      </Button>
    );
  };

  return (
    <div className="text-muted-foreground flex items-center justify-center relative h-8 w-8 mx-auto">
      {defaultContent()}
      {hoverContent()}
    </div>
  );
}
