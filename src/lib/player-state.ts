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
