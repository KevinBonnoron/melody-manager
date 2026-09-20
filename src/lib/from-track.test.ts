import type { Track } from '@/shared';
import { fromTrack } from './from-track';
import { describe, expect, it } from 'bun:test';

const track = (id: string) => ({ id }) as Track;

describe('fromTrack', () => {
  it('hands over the track clicked and the ones after it', () => {
    const context = [track('a'), track('b'), track('c'), track('d')];
    expect(fromTrack(track('c'), context).map((t) => t.id)).toEqual(['c', 'd']);
  });

  it('hands over the whole list when the first is clicked', () => {
    const context = [track('a'), track('b')];
    expect(fromTrack(track('a'), context).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('hands over the track alone when it is not in the list', () => {
    expect(fromTrack(track('z'), [track('a')]).map((t) => t.id)).toEqual(['z']);
  });

  it('hands over the track alone when there is no list', () => {
    expect(fromTrack(track('a'), []).map((t) => t.id)).toEqual(['a']);
  });
});
