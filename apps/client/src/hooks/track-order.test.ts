import type { Track, TrackMetadata } from '@/shared';
import { byPosition } from './track-order';
import { describe, expect, it } from 'bun:test';

const track = (title: string, metadata?: Partial<TrackMetadata>) => ({ title, metadata }) as Track;

const ordered = (tracks: Track[]) => [...tracks].sort(byPosition).map((t) => t.title);

describe('byPosition', () => {
  it('puts an album back in the order its files give', () => {
    const tracks = [track('Tones', { trackNumber: 7 }), track('Cause', { trackNumber: 1 }), track('Helix', { trackNumber: 3 })];

    expect(ordered(tracks)).toEqual(['Cause', 'Helix', 'Tones']);
  });

  it('separates the discs before the numbers mean anything', () => {
    const tracks = [track('Second disc, first track', { trackNumber: 1, discNumber: 2 }), track('First disc, second track', { trackNumber: 2, discNumber: 1 })];

    expect(ordered(tracks)).toEqual(['First disc, second track', 'Second disc, first track']);
  });

  it('keeps a track that carries no number behind the ones that do', () => {
    const tracks = [track('Untagged'), track('Numbered', { trackNumber: 9 })];

    expect(ordered(tracks)).toEqual(['Numbered', 'Untagged']);
  });

  it('orders the chapters of one long video by where they start', () => {
    const tracks = [track('Later', { startTime: 600 }), track('Earlier', { startTime: 60 })];

    expect(ordered(tracks)).toEqual(['Earlier', 'Later']);
  });

  it('falls through to the title when the numbers cannot tell two apart', () => {
    const tracks = [track('Beta', { trackNumber: 3 }), track('Alpha', { trackNumber: 3 })];

    expect(ordered(tracks)).toEqual(['Alpha', 'Beta']);
  });

  it('answers the same way whichever way round it is asked', () => {
    const same = [track('Alpha', { trackNumber: 3 }), track('Alpha', { trackNumber: 3 })];
    const [first, second] = same;

    expect(byPosition(first, second)).toBe(0);
    expect(byPosition(second, first)).toBe(0);
  });
});
