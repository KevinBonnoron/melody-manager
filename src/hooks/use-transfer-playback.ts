import { useCallback } from 'react';
import { toast } from 'sonner';
import { deviceClient } from '@/clients/device.client';
import { useMusicPlayer } from '@/contexts/music-player-context';
import i18n from '@/i18n';
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
      // Silence the old one only once the new one has taken the track. A target
      // that refuses, because it went away or was never approved, used to leave
      // the listener with nothing playing anywhere and no way back to where they
      // were.
      deviceClient
        .play(device.id, track.id, Math.round(position))
        .then(() => {
          if (isRemote && remote) {
            remote.stop();
            return;
          }

          if (isPlaying) {
            togglePlayPause();
          }
        })
        .catch((error) => {
          console.error('Handing playback over failed:', error);
          toast.error(i18n.t('MusicPlayer.deviceError'));
        });
    },
    [track, isRemote, remote, currentTime, isPlaying, togglePlayPause],
  );
}
