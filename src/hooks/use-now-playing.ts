import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@/shared';
import { useRemotePlayback } from './use-remote-playback';

export function useNowPlaying(): { track: Track | null; isPlaying: boolean; isRemote: boolean } {
  const { currentTrack, isPlaying } = useMusicPlayer();
  const remote = useRemotePlayback();
  const playingHere = isPlaying && currentTrack !== null;
  const onRemote = remote !== null && !playingHere;

  if (onRemote && remote) {
    return { track: remote.track ?? null, isPlaying: remote.isPlaying, isRemote: true };
  }

  return { track: currentTrack, isPlaying, isRemote: false };
}
