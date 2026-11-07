import { volumeToggle } from './volume-toggle';
import { describe, expect, it } from 'bun:test';

describe('volumeToggle', () => {
  it('comes back to where the level was, not to where it was last dragged', () => {
    // Read back from a speaker, or restored on a reload: nothing has been
    // dragged, so what is remembered is still the level it started at.
    const muted = volumeToggle(0.6, 1);
    expect(muted).toEqual({ next: 0, remember: 0.6 });

    expect(volumeToggle(muted.next, muted.remember).next).toBe(0.6);
  });

  it('remembers a level that was dragged, the same way', () => {
    const muted = volumeToggle(0.25, 0.8);
    expect(volumeToggle(muted.next, muted.remember).next).toBe(0.25);
  });

  it('unmutes to something audible when silence is all it has ever known', () => {
    expect(volumeToggle(0, 0).next).toBe(0.5);
  });
});
