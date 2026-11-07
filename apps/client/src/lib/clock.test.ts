import { offsetFrom, reached } from './clock';
import { describe, expect, it } from 'bun:test';

describe('offsetFrom', () => {
  it('has nothing to say without a sample', () => {
    expect(offsetFrom([])).toBeNull();
  });

  it('reads a clock that agrees as no offset at all', () => {
    expect(offsetFrom([{ sent: 1000, said: 1010, back: 1020 }])).toBe(0);
  });

  it('halves the round trip to guess the one way', () => {
    expect(offsetFrom([{ sent: 1000, said: 5010, back: 1020 }])).toBe(4000);
  });

  it('keeps the shortest trip rather than the last', () => {
    const offset = offsetFrom([
      { sent: 0, said: 1000, back: 400 },
      { sent: 1000, said: 2010, back: 1020 },
      { sent: 2000, said: 3000, back: 2600 },
    ]);
    expect(offset).toBe(1000);
  });

  it('ignores a trip that came back before it left', () => {
    expect(offsetFrom([{ sent: 1000, said: 1010, back: 900 }])).toBeNull();
  });
});

describe('reached', () => {
  const at = '2026-09-19T12:00:00.000Z';
  const when = Date.parse(at);

  it('stands still while paused', () => {
    expect(reached(30, at, false, when + 10_000)).toBe(30);
  });

  it('counts the seconds since it was written down', () => {
    expect(reached(30, at, true, when + 4_500)).toBe(34.5);
  });

  it('has nowhere to count from without a moment', () => {
    expect(reached(30, '', true, when)).toBe(30);
  });

  it('refuses to count backwards when the clocks disagree', () => {
    expect(reached(30, at, true, when - 4_000)).toBe(30);
  });

  it('ignores a moment it cannot read', () => {
    expect(reached(30, 'not a date', true, when)).toBe(30);
  });
});
