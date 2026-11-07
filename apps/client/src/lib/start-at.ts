/** What a device does about a moment it was told to start on. */
export type Start = { wait: number } | { late: number };

/**
 * startsIn says whether there is still time to wait for the agreed moment, or
 * whether it has passed and the sound has to come in where the others already
 * are. Starting late at the position that was handed over would leave a device
 * trailing the rest for the whole track.
 */
export function startsIn(startAt: number, now: number): Start {
  if (!startAt) {
    return { late: 0 };
  }

  const behind = now - startAt;
  return behind >= 0 ? { late: behind } : { wait: -behind };
}
