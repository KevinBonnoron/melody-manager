import { useEffect, useRef, useState } from 'react';

const REBASE_TOLERANCE_S = 1.5;

type Reported = { position: number; playing: boolean } | null | undefined;

export function useReportedPosition(device: Reported): number {
  const [, tick] = useState(0);
  const playing = device?.playing ?? false;
  const baseRef = useRef<{ position: number; at: number; seen: Reported; playing: boolean }>({ position: 0, at: Date.now(), seen: null, playing: false });

  if (device && baseRef.current.seen !== device) {
    const base = baseRef.current;
    const expected = base.position + (base.playing ? (Date.now() - base.at) / 1000 : 0);
    const rebase = !base.seen || base.playing !== playing || Math.abs(device.position - expected) > REBASE_TOLERANCE_S;
    baseRef.current = rebase ? { position: device.position, at: Date.now(), seen: device, playing } : { ...base, seen: device, playing };
  }

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

  const base = baseRef.current;
  return base.position + (playing ? (Date.now() - base.at) / 1000 : 0);
}
