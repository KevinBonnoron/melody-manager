import { useEffect, useRef, useState } from 'react';
import { useMusicPlayer } from '@/contexts/music-player-context';
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
  const { volume, setVolume, playsHere } = useMusicPlayer();
  const [pending, setPending] = useState<number | null>(null);
  const [previous, setPrevious] = useState(1);
  const commandRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pending === null) {
      return;
    }

    if (Math.abs(volume - pending) < 0.01) {
      setPending(null);
      return;
    }

    const timer = setTimeout(() => setPending(null), REPORT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [volume, pending]);

  useEffect(() => {
    setPending(null);
    return () => {
      if (commandRef.current) {
        clearTimeout(commandRef.current);
        commandRef.current = null;
      }
    };
  }, []);

  const level = playsHere ? volume : (pending ?? volume);

  const apply = (next: number) => {
    if (next > 0) {
      setPrevious(next);
    }

    if (playsHere) {
      setVolume(next);
      return;
    }

    setPending(next);
    if (commandRef.current) {
      clearTimeout(commandRef.current);
    }
    commandRef.current = setTimeout(() => setVolume(next), REMOTE_DEBOUNCE_MS);
  };

  const toggle = () => {
    const { next, remember } = volumeToggle(level, previous);
    setPrevious(remember);
    apply(next);
  };

  return { level, isMuted: level === 0, apply, toggle };
}
