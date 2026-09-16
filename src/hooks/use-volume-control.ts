import { useEffect, useRef, useState } from 'react';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useNowPlaying } from './use-now-playing';
import { useRemotePlayback } from './use-remote-playback';
import { volumeToggle } from './volume-toggle';

const REMOTE_DEBOUNCE_MS = 150;
const REPORT_GRACE_MS = 2000;

/**
 * The level the controls show and set, wherever the sound comes out.
 *
 * A speaker's level belongs to the speaker and is read back from it, so what
 * was asked for stands until it reports the same thing or has had long enough
 * that something went wrong. A slider emits a change per pixel and each one is
 * a round trip, so only where the drag settles is sent.
 */
export function useVolumeControl() {
  const { volume, setVolume } = useMusicPlayer();
  const { isRemote } = useNowPlaying();
  const remote = useRemotePlayback();
  const [pending, setPending] = useState<number | null>(null);
  const [previous, setPrevious] = useState(1);
  const commandRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const remoteVolume = remote?.volume;

  useEffect(() => {
    if (pending === null || remoteVolume === undefined) {
      return;
    }

    if (Math.abs(remoteVolume - pending) < 0.01) {
      setPending(null);
      return;
    }

    const timer = setTimeout(() => setPending(null), REPORT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [remoteVolume, pending]);

  // A level asked for belongs to the device it was asked of. Left standing when
  // the target changes, it is shown as the new device's own for as long as the
  // grace period lasts, and a mute sends that number to a device that never
  // reported it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the identity of the device is what invalidates the pending command, not the object
  useEffect(() => {
    setPending(null);
    if (commandRef.current) {
      clearTimeout(commandRef.current);
      commandRef.current = null;
    }

    return () => {
      if (commandRef.current) {
        clearTimeout(commandRef.current);
        commandRef.current = null;
      }
    };
  }, [isRemote, remote?.device.id]);

  const level = isRemote && remote ? (pending ?? remote.volume) : volume;

  const apply = (next: number) => {
    if (next > 0) {
      setPrevious(next);
    }

    if (isRemote && remote) {
      setPending(next);
      if (commandRef.current) {
        clearTimeout(commandRef.current);
      }

      const request = ++requestRef.current;
      commandRef.current = setTimeout(() => {
        // The level is sent and nothing waits on it, so a refusal has to be
        // caught here or it is an unhandled rejection. Taking the asked-for
        // level back leaves the slider on what the device reports, which is the
        // truth once the command has failed, unless a newer level was asked for
        // while this one was out: that one is what the slider owes its position
        // to, and clearing it shows the device's old level under the finger.
        remote.setVolume(next).catch((error) => {
          console.error('Setting the device volume failed:', error);
          if (request === requestRef.current) {
            setPending(null);
          }
        });
      }, REMOTE_DEBOUNCE_MS);
      return;
    }

    setVolume(next);
  };

  const toggle = () => {
    const { next, remember } = volumeToggle(level, previous);
    setPrevious(remember);
    apply(next);
  };

  return { level, isMuted: level === 0, apply, toggle };
}
