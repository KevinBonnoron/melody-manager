import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useNowPlaying } from '@/hooks/use-now-playing';
import type { Track } from '@/shared';

interface Props {
  index: number;
  track: Track;
  contextTracks: Track[];
}

export function TrackIndexButton({ index, track, contextTracks }: Props) {
  const { currentTrack, isLoading, playTrackWithContext, togglePlayPause } = useMusicPlayer();
  const { track: nowPlaying, isPlaying } = useNowPlaying();
  const isCurrentTrack = nowPlaying?.id === track.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;
  const isCurrentlyLoading = currentTrack?.id === track.id && isLoading;
  const unplayable = track.availability === 'none';

  function handleClick() {
    if (unplayable) {
      return;
    }

    // Toggling only makes sense for what this client holds; a track playing on
    // another device is started here instead.
    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      playTrackWithContext(track, contextTracks);
    }
  }

  const defaultContent = () => {
    // A track with no audio anywhere keeps its number and never turns into a
    // play affordance on hover: inviting a click that cannot work is worse than
    // showing nothing.
    if (unplayable) {
      return <span className="text-sm absolute inset-0 flex items-center justify-center text-muted-foreground">{index}</span>;
    }

    if (isCurrentlyLoading) {
      return <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />;
    }

    if (isCurrentlyPlaying) {
      return <Pause className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground group-hover:opacity-0 transition-[opacity]" fill="currentColor" />;
    }

    return <span className={`text-sm absolute inset-0 flex items-center justify-center transition-opacity ${isCurrentTrack ? 'text-primary' : ''} group-hover:opacity-0`}>{index}</span>;
  };

  const hoverContent = () => {
    if (isCurrentlyLoading || unplayable) {
      return null;
    }

    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity opacity-0 group-hover:opacity-100 text-primary hover:!bg-transparent hover:!text-primary"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
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
