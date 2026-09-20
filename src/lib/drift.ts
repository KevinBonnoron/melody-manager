/** What a device does about being ahead of or behind where it should be. */
export interface Correction {
  rate: number;
  seek: boolean;
}

/** Inside this, being early or late is not worth touching. */
const SETTLED = 0.02;

/** Past this, no playback rate would close the gap before the track ends. */
const TOO_FAR = 1;

/** The most the speed may be bent. Beyond it the change becomes audible. */
const MOST = 0.001;

/**
 * correctionFor turns being out of step into what to do about it. Drift is
 * where this device is minus where it should be, in seconds: positive is ahead.
 *
 * Two decoders never run at quite the same speed, so devices told to start
 * together still walk apart. Bending the speed by a thousandth is inaudible and
 * closes a small gap over a few seconds; a large one is not a drift but a jump,
 * and is met by moving the playhead rather than by waiting a quarter of an hour
 * for a thousandth to catch up.
 */
export function correctionFor(drift: number): Correction {
  if (!Number.isFinite(drift)) {
    return { rate: 1, seek: false };
  }

  if (Math.abs(drift) >= TOO_FAR) {
    return { rate: 1, seek: true };
  }

  if (Math.abs(drift) <= SETTLED) {
    return { rate: 1, seek: false };
  }

  const bend = Math.min(MOST, Math.max(-MOST, drift / 100));
  return { rate: Number((1 - bend).toFixed(6)), seek: false };
}
