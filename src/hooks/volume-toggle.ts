/**
 * What muting and unmuting do to the level, and what to remember doing it.
 *
 * The level to come back to is where it is now, not where it was last dragged
 * to: one read back from a speaker, or restored from storage on a reload, never
 * passed through the slider, and unmuting sent it to full instead of back to
 * what was playing.
 */
export function volumeToggle(level: number, previous: number): { next: number; remember: number } {
  if (level === 0) {
    return { next: previous > 0 ? previous : 0.5, remember: previous };
  }

  return { next: 0, remember: level };
}
