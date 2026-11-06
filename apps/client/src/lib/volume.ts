const KEY = 'melody-manager-volume';

/** The level this device was last set to, which it carries into its next life. */
export function storedVolume(): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(KEY) ?? '');
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
  } catch {
    return 1;
  }
}

export function rememberVolume(level: number): void {
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // A browser refusing storage still plays; it just forgets the level.
  }
}
