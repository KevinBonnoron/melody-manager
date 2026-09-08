import { useMusicPlayer } from '@/contexts/music-player-context';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { LikeButton } from '../like-button';
import { NextButton } from './next-button';
import { PlayButton } from './play-button';
import { PreviousButton } from './previous-button';
import { RepeatButton } from './repeat-button';
import { ShuffleButton } from './shuffle-button';

export function PlaybackControls() {
  const { shuffle, repeatMode, isPlaying, isLoading, queue, currentTrack, playNext, playPrevious, togglePlayPause, toggleShuffle, toggleRepeat } = useMusicPlayer();
  const { isLiked, toggleLike } = useTrackLikes();
  const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
  const canGoNext = (currentIndex >= 0 && currentIndex < queue.length - 1) || (repeatMode === 'all' && queue.length > 0);
  const canGoPrevious = currentIndex > 0 || (repeatMode === 'all' && queue.length > 0);
  return (
    <div className="flex items-center justify-self-center gap-2">
      <div className="hidden sm:flex items-center gap-2 w-20 justify-end">
        <ShuffleButton shuffle={shuffle} onToggle={toggleShuffle} />
      </div>
      <PreviousButton disabled={!canGoPrevious} onPrevious={playPrevious} />
      <PlayButton isPlaying={isPlaying} isLoading={isLoading} onToggle={togglePlayPause} />
      <NextButton disabled={!canGoNext} onNext={playNext} />
      <div className="hidden sm:flex items-center gap-2 w-20">
        <RepeatButton repeatMode={repeatMode} onToggle={toggleRepeat} />
        {currentTrack && <LikeButton isLiked={isLiked(currentTrack.id)} toggleLike={() => toggleLike(currentTrack.id)} />}
      </div>
    </div>
  );
}
