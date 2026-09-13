import { useCallback } from 'react';
import { deviceClient } from '@/clients/device.client';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { ClientDevice } from '@/shared';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';

// Hand the current playback to another of the user's clients, from the same
// spot, and go quiet here.
export function useTransferPlayback(): (device: ClientDevice) => void {
  const { currentTime, isPlaying, togglePlayPause } = useMusicPlayer();
  const { track, isRemote } = useNowPlaying();
  const remote = useRemotePlayback();

  return useCallback(
    (device: ClientDevice) => {
      if (!track) {
        return;
      }

      const position = isRemote && remote ? remote.currentTime : currentTime;
      deviceClient.play(device.id, track.id, Math.round(position)).catch((error) => console.error('Failed to hand playback over:', error));

      if (isRemote && remote) {
        remote.stop();
      } else if (isPlaying) {
        togglePlayPause();
      }
    },
    [track, isRemote, remote, currentTime, isPlaying, togglePlayPause],
  );
}
