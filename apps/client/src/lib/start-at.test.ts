import { startsIn } from './start-at';
import { describe, expect, it } from 'bun:test';

describe('startsIn', () => {
  it('starts at once when no moment was agreed', () => {
    expect(startsIn(0, 5_000)).toEqual({ late: 0 });
  });

  it('waits for a moment still to come', () => {
    expect(startsIn(5_700, 5_000)).toEqual({ wait: 700 });
  });

  it('says how late it is when the moment has passed', () => {
    expect(startsIn(5_000, 5_250)).toEqual({ late: 250 });
  });

  it('treats the moment itself as already there', () => {
    expect(startsIn(5_000, 5_000)).toEqual({ late: 0 });
  });
});
