import { useEffect, useRef, useState } from 'react';

// A speaker reports its position in whole seconds, so a report can be up to a
// second behind where playback actually is. Re-basing the local count on every
// one of them steps the display by that truncation error each time, and two
// clients that happen to re-base on different reports end up a second apart
// from each other. A report is therefore taken as a correction only when it
// disagrees with the count already running by more than the source's own
// precision; otherwise it confirms it, and the count carries on smoothly.
const REBASE_TOLERANCE_S = 1.5;

type Reported = { position: number; playing: boolean } | null | undefined;

export function useReportedPosition(device: Reported): number {
  const [, tick] = useState(0);
  const playing = device?.playing ?? false;
  const baseRef = useRef<{ position: number; at: number; seen: Reported; playing: boolean }>({ position: 0, at: Date.now(), seen: null, playing: false });

  if (device && baseRef.current.seen !== device) {
    const base = baseRef.current;
    const expected = base.position + (base.playing ? (Date.now() - base.at) / 1000 : 0);
    // Starting, and starting or stopping, always re-base: the elapsed time
    // either has no meaning yet or must not count the pause.
    const rebase = !base.seen || base.playing !== playing || Math.abs(device.position - expected) > REBASE_TOLERANCE_S;
    baseRef.current = rebase ? { position: device.position, at: Date.now(), seen: device, playing } : { ...base, seen: device, playing };
  }

  // Redrawn when the displayed second actually changes, not once per second
  // from an arbitrary starting point. A plain interval lands mid-second and
  // stays there, so this client showed a second that the one playing had
  // already left, and the two disagreed by up to a second for as long as
  // playback ran.
  useEffect(() => {
    if (!playing) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextSecond = () => {
      const base = baseRef.current;
      const millis = (base.position + (Date.now() - base.at) / 1000) * 1000;
      timer = setTimeout(
        () => {
          tick((n) => n + 1);
          scheduleNextSecond();
        },
        Math.max(16, 1000 - (millis % 1000)),
      );
    };

    scheduleNextSecond();
    return () => clearTimeout(timer);
  }, [playing]);

  if (!device) {
    return 0;
  }

  // A paused device sits where it was; only a playing one has moved.
  const base = baseRef.current;
  return base.position + (playing ? (Date.now() - base.at) / 1000 : 0);
}
