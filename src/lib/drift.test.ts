import { correctionFor } from './drift';
import { describe, expect, it } from 'bun:test';

describe('correctionFor', () => {
  it('leaves a device that is in step alone', () => {
    expect(correctionFor(0)).toEqual({ rate: 1, seek: false });
    expect(correctionFor(0.01)).toEqual({ rate: 1, seek: false });
    expect(correctionFor(-0.01)).toEqual({ rate: 1, seek: false });
  });

  it('slows a device that has run ahead', () => {
    const { rate, seek } = correctionFor(0.1);
    expect(seek).toBe(false);
    expect(rate).toBeLessThan(1);
    expect(rate).toBeGreaterThanOrEqual(0.999);
  });

  it('hurries a device that has fallen behind', () => {
    const { rate, seek } = correctionFor(-0.1);
    expect(seek).toBe(false);
    expect(rate).toBeGreaterThan(1);
    expect(rate).toBeLessThanOrEqual(1.001);
  });

  it('bends the speed less for a smaller gap', () => {
    expect(correctionFor(0.05).rate).toBeGreaterThan(correctionFor(0.5).rate);
  });

  it('never bends the speed far enough to be heard', () => {
    for (const drift of [0.03, 0.2, 0.9, -0.03, -0.2, -0.9]) {
      const { rate } = correctionFor(drift);
      expect(rate).toBeGreaterThanOrEqual(0.999);
      expect(rate).toBeLessThanOrEqual(1.001);
    }
  });

  it('moves the playhead rather than waiting when the gap is a jump', () => {
    expect(correctionFor(1.5)).toEqual({ rate: 1, seek: true });
    expect(correctionFor(-4)).toEqual({ rate: 1, seek: true });
  });

  it('does nothing with a gap it cannot read', () => {
    expect(correctionFor(Number.NaN)).toEqual({ rate: 1, seek: false });
  });
});
