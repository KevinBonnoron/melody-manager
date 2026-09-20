import { playheadOf } from './playhead';
import { describe, expect, it } from 'bun:test';

const at = '2026-09-20T10:00:00.000Z';
const when = Date.parse(at);

const head = (over: Partial<Parameters<typeof playheadOf>[0]> = {}) => playheadOf({ position: 30, positionAt: at, duration: 180, advancing: true, loading: false, media: null, ...over });

describe('playheadOf', () => {
  it('counts on from what was written down', () => {
    expect(head().read(when + 5_000)).toBe(35);
  });

  it('stands still when nothing is carrying it', () => {
    expect(head({ advancing: false }).read(when + 5_000)).toBe(30);
  });

  it('reads the element rather than the clock once one is holding the track', () => {
    const media = { currentTime: 12 } as HTMLMediaElement;
    expect(head({ media }).read(when + 5_000)).toBe(12);
  });

  it('follows the element even while nothing is advancing', () => {
    const media = { currentTime: 12 } as HTMLMediaElement;
    expect(head({ media, advancing: false }).read(when + 5_000)).toBe(12);
  });

  it('reads the same at a given moment however often it is asked', () => {
    const playhead = head();
    expect(playhead.read(when + 1_500)).toBe(playhead.read(when + 1_500));
  });
});
