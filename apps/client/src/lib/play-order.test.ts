import type { PlayerState, Track } from '@/shared';
import { queueOf } from './play-order';
import { describe, expect, it } from 'bun:test';

const library = (...ids: string[]) => new Map(ids.map((id) => [id, { id, title: id } as Track]));

const state = (list: string[], order: number[]) => ({ list, order }) as Pick<PlayerState, 'list' | 'order'>;

describe('queueOf', () => {
  it('reads the list in the order it is played', () => {
    const queue = queueOf(state(['a', 'b', 'c'], [2, 0, 1]), library('a', 'b', 'c'));
    expect(queue.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('is empty when nothing is queued', () => {
    expect(queueOf(state([], []), library('a'))).toEqual([]);
  });

  it('leaves out a track the library does not know', () => {
    const queue = queueOf(state(['a', 'gone', 'c'], [0, 1, 2]), library('a', 'c'));
    expect(queue.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('survives an order pointing past its list', () => {
    const queue = queueOf(state(['a'], [0, 7]), library('a'));
    expect(queue.map((t) => t.id)).toEqual(['a']);
  });

  it('shows nothing when the library has not loaded yet', () => {
    expect(queueOf(state(['a', 'b'], [0, 1]), new Map())).toEqual([]);
  });
});
