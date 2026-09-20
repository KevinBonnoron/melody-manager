export interface Sample {
  sent: number;
  said: number;
  back: number;
}

/**
 * offsetFrom keeps the answer from the shortest round trip. Halving the trip to
 * guess the one-way delay is only fair when the two halves are alike, which the
 * shortest trip is the most likely to be.
 */
export function offsetFrom(samples: Sample[]): number | null {
  let best = Number.POSITIVE_INFINITY;
  let found: number | null = null;

  for (const { sent, said, back } of samples) {
    const trip = back - sent;
    if (trip < 0 || trip >= best) {
      continue;
    }
    best = trip;
    found = said - (sent + back) / 2;
  }

  return found;
}

/** reached is where the playhead has got to by now, from what was written down. */
export function reached(position: number, positionAt: string, playing: boolean, now: number): number {
  if (!playing || !positionAt) {
    return position;
  }

  const since = now - Date.parse(positionAt);
  if (!Number.isFinite(since) || since < 0) {
    return position;
  }
  return position + since / 1000;
}
