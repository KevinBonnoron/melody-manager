import { useCallback } from 'react';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { type Device, isNetworkDevice } from '@/shared';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';
import { useTransferPlayback } from './use-transfer-playback';

/**
 * Picking where the music plays, by whichever of the two routes fits.
 *
 * A speaker this tab already holds is handed over by the player itself, which
 * stops the one it holds before starting the next and carries the position
 * across, one command at a time. Playback held anywhere else cannot be moved
 * that way, because this tab has nothing to stop: it is started on the new
 * device and the old one told to stop by name.
 *
 * Reading which of the two applies from what is playing rather than from what
 * this tab holds sent every speaker-to-speaker move down the second route,
 * which leaves the position behind and races with whatever else is in flight.
 */
export function useSelectDevice(): (device: Device | null) => void {
  const { activeDevice, switchDevice } = useMusicPlayer();
  const { isRemote } = useNowPlaying();
  const remote = useRemotePlayback();
  const transfer = useTransferPlayback();

  return useCallback(
    (device: Device | null) => {
      const held = activeDevice !== null && isNetworkDevice(activeDevice);
      if (device && !held && isRemote && remote?.track) {
        transfer(device);
        return;
      }

      switchDevice(device);
    },
    [activeDevice, isRemote, remote?.track, switchDevice, transfer],
  );
}
