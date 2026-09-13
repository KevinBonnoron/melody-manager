import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@/shared';
import { useRemotePlayback } from './use-remote-playback';

// What is playing for this user, wherever it plays. Pausing never clears
// `currentTrack`, so a browser that played earlier keeps one for good; reading
// it directly makes every "now playing" marker outlive the playback it marks.
export function useNowPlaying(): { track: Track | null; isPlaying: boolean; isRemote: boolean } {
  const { currentTrack, isPlaying } = useMusicPlayer();
  const remote = useRemotePlayback();
  const playingHere = isPlaying && currentTrack !== null;
  // Not playing here and another device still holds the session: follow it.
  // Requiring it to be *playing* made a remote pause fall back to whatever stale
  // track this client happened to keep.
  const onRemote = remote !== null && !playingHere;

  if (onRemote && remote) {
    return { track: remote.track ?? null, isPlaying: remote.isPlaying, isRemote: true };
  }

  return { track: currentTrack, isPlaying, isRemote: false };
}
