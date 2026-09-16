import { useCallback } from 'react';
import { toast } from 'sonner';
import { deviceClient } from '@/clients/device.client';
import { useMusicPlayer } from '@/contexts/music-player-context';
import i18n from '@/i18n';
import type { Device } from '@/shared';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';

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
