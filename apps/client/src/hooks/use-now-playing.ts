import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@/shared';

export function useNowPlaying(): { track: Track | null; isPlaying: boolean; isRemote: boolean } {
  const { currentTrack, isPlaying, playsHere } = useMusicPlayer();
  return { track: currentTrack, isPlaying, isRemote: !playsHere };
}
