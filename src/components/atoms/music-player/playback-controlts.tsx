import { useMusicPlayer } from '@/contexts/music-player-context';
import { useTrackRatings } from '@/hooks/use-ratings';
import type { Track } from '@/shared';
import { LikeButton } from '../like-button';
import { NextButton } from './next-button';
import { PlayButton } from './play-button';
import { PreviousButton } from './previous-button';
import { queueBounds } from './queue-bounds';
import { RepeatButton } from './repeat-button';
import { ShuffleButton } from './shuffle-button';

interface Props {
  remote?: {
    isPlaying: boolean;
    track?: Track;
    togglePlayPause: () => void;
    playNext: () => void;
    playPrevious: () => void;
  };
}

export function PlaybackControls({ remote }: Props) {
  const local = useMusicPlayer();
  const { shuffle, repeatMode, queue, toggleShuffle, toggleRepeat } = local;
  const isPlaying = remote ? remote.isPlaying : local.isPlaying;
  const isLoading = remote ? false : local.isLoading;
  const currentTrack = remote ? remote.track : local.currentTrack;
  const playNext = remote ? remote.playNext : local.playNext;
  const playPrevious = remote ? remote.playPrevious : local.playPrevious;
  const togglePlayPause = remote ? remote.togglePlayPause : local.togglePlayPause;
  const { isLiked, toggleLike } = useTrackRatings();
  const { canGoNext, canGoPrevious } = queueBounds({ queue, trackId: currentTrack?.id, repeatMode, remote: remote !== undefined });
  return (
    <div className="flex items-center justify-self-center gap-2">
      <div className="hidden @lg:flex items-center gap-2 w-20 justify-end">
        <ShuffleButton shuffle={shuffle} onToggle={toggleShuffle} />
      </div>
      <PreviousButton disabled={!canGoPrevious} onPrevious={playPrevious} />
      <PlayButton isPlaying={isPlaying} isLoading={isLoading} onToggle={togglePlayPause} />
      <NextButton disabled={!canGoNext} onNext={playNext} />
      <div className="hidden @lg:flex items-center gap-2 w-20">
        <RepeatButton repeatMode={repeatMode} onToggle={toggleRepeat} />
        {currentTrack && <LikeButton isLiked={isLiked(currentTrack.id)} toggleLike={() => toggleLike(currentTrack.id)} />}
      </div>
    </div>
  );
}
