import { playerClient } from '@/clients/player.client';
import { pb } from '@/lib/pocketbase';
import { measure } from '@/lib/server-clock';
import type { PlaybackState, PlayerState } from '@/shared';

const nothing: PlayerState = {
  track: '',
  position: 0,
  positionAt: '',
  playing: false,
  devices: [],
  list: [],
  order: [],
  index: 0,
  shuffle: false,
  repeat: 'none',
  now: '',
};

let state: PlayerState = nothing;
let seen = false;
// Counts what has been applied, so that an answer which was already on its way
// when a newer one landed can be recognised as behind and dropped. Orders,
// realtime and a read of the record all describe the same thing and none of
// them arrives in order.
let applied = 0;
let watching: Promise<() => void> | null = null;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * apply takes the state an order answered with. Orders and realtime describe
 * the same record, and whichever arrives last is the one that saw it last.
 */
export function apply(next: PlayerState) {
  state = next;
  seen = true;
  applied++;
  announce();
}

/** ready says whether the record has been read at least once. Until it has,
 * an empty state means "not known yet" rather than "nothing is playing", and
 * acting on it claims a playback that may already be somewhere else. */
export function ready(): boolean {
  return seen;
}

function fromRecord(record: PlaybackState): PlayerState {
  return {
    track: record.track ?? '',
    position: record.position ?? 0,
    positionAt: record.positionAt ?? '',
    playing: record.playing ?? false,
    devices: record.devices ?? [],
    list: record.list ?? [],
    order: record.order ?? [],
    index: record.index ?? 0,
    shuffle: record.shuffle ?? false,
    repeat: record.repeat ?? 'none',
    now: new Date().toISOString(),
  };
}

async function watch(): Promise<() => void> {
  try {
    apply(await playerClient.state());
  } catch (error) {
    console.error('the player state could not be read', error);
  }
  void measure();

  const off = await pb.collection<PlaybackState>('playback_state').subscribe('*', (event) => {
    if (event.action === 'delete') {
      apply(nothing);
      return;
    }
    apply(fromRecord(event.record));
  });

  return () => {
    off();
  };
}

/**
 * refresh reads the record again and says whether it managed to. The connection
 * that carries its changes can be away without saying so, and what is held is
 * then behind: a device taken out of the set while its tab was in the
 * background learns it here.
 *
 * An answer that anything overtook is dropped rather than applied. It describes
 * a record that has since moved on, and putting it back would undo whatever
 * moved it.
 */
export async function refresh(): Promise<boolean> {
  if (!watching) {
    return false;
  }

  const was = applied;
  try {
    const read = await playerClient.state();
    if (applied !== was) {
      return true;
    }
    apply(read);
    return true;
  } catch (error) {
    console.error('the player state could not be read again', error);
    return false;
  }
}

/**
 * subscribe starts watching the record once and keeps watching it. There is one
 * playback record for the whole page, and several hooks read it: stopping when
 * the last of them lets go would restart the whole thing, and what is being
 * read afresh each time, the moment one of them is replaced by another.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!watching) {
    watching = watch();
  }

  return () => {
    listeners.delete(listener);
  };
}

export function snapshot(): PlayerState {
  return state;
}

export function empty(): PlayerState {
  return nothing;
}
