import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { deviceClient } from '@/clients/device.client';
import { useMusicPlayer } from '@/contexts/music-player-context';
import i18n from '@/i18n';
import { type Device, isNetworkDevice } from '@/shared';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';

/**
 * Hands playback to a device from wherever it is now, when wherever it is now
 * is not this tab's to stop by switching away from it: another browser's tab,
 * or a speaker another tab chose.
 */
export function useTransferPlayback(): (device: Device) => void {
  const { currentTime, isPlaying, togglePlayPause, adoptDevice } = useMusicPlayer();
  const { track, isRemote } = useNowPlaying();
  const remote = useRemotePlayback();
  const requestRef = useRef(0);

  return useCallback(
    (device: Device) => {
      if (!track) {
        return;
      }

      // Read before anything moves. Adopting the new device changes which one
      // the hook answers with, and a stop issued after that would silence the
      // device just started rather than the one being left.
      const from = isRemote && remote ? remote.device : null;
      const position = isRemote && remote ? remote.currentTime : currentTime;
      // Two devices picked before the first answers leave two handovers in
      // flight, and the one that answers last decides. Only the last one asked
      // for is still what anyone wants: an older one taking its device on would
      // leave this tab driving a device nobody chose, and stopping its source
      // would silence the one now playing.
      const request = ++requestRef.current;

      deviceClient
        .play(device.id, track.id, Math.round(position))
        .then(() => {
          if (request !== requestRef.current) {
            return;
          }

          if (isNetworkDevice(device)) {
            adoptDevice(device);
          }

          if (from) {
            deviceClient.stop(from.id).catch((error) => console.error('Stopping the device that was playing failed:', error));
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
    [track, isRemote, remote, currentTime, isPlaying, togglePlayPause, adoptDevice],
  );
}
