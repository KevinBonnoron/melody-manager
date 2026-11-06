import { playerClient } from '@/clients/player.client';
import { offsetFrom, type Sample } from './clock';

const ROUND_TRIPS = 3;

let offset = 0;
let taken = false;
let pending: Promise<number> | null = null;

/**
 * measure asks the server for its clock a few times and keeps the answer from
 * the shortest round trip, whose one-way delay is the least guessed at. A
 * progress bar does not need this; devices agreeing on a beat do. Three tries
 * is enough to throw out a slow one, and it happens once per page.
 */
export async function measure(): Promise<number> {
  if (pending) {
    return pending;
  }

  pending = (async () => {
    const samples: Sample[] = [];
    for (let i = 0; i < ROUND_TRIPS; i++) {
      const sent = Date.now();
      try {
        const { now } = await playerClient.time();
        samples.push({ sent, said: Date.parse(now), back: Date.now() });
      } catch {
        break;
      }
    }

    const found = offsetFrom(samples);
    if (found !== null) {
      offset = found;
      taken = true;
    }
    return offset;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/**
 * whenMeasured is the promise of a clock worth reading. Until the offset has
 * been taken, this machine's own clock is all there is, and two machines whose
 * clocks differ by a second would arrange to start a second apart.
 */
export function whenMeasured(): Promise<number> {
  if (taken) {
    return Promise.resolve(offset);
  }
  return measure();
}

/** serverNow is this machine's clock read as the server would read it. */
export function serverNow(): number {
  return Date.now() + offset;
}

export function clockOffset(): number {
  return offset;
}
