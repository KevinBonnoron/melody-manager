import { useCallback } from 'react';
import { deviceClient } from '@/clients/device.client';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Device } from '@/shared';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';

// Hand the current playback to another device, from the same spot, and go quiet
// where it was. Any device: another of the user's clients, or a speaker on the
// network. switchDevice moves what this tab is playing, which is a different
// question and answers nothing when the music is in another tab.
export function useTransferPlayback(): (device: Device) => void {
  const { currentTime, isPlaying, togglePlayPause } = useMusicPlayer();
  const { track, isRemote } = useNowPlaying();
  const remote = useRemotePlayback();

  return useCallback(
    (device: Device) => {
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
