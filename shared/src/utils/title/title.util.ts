/**
 * Normalizes track titles by stripping surrounding quotes (single or double),
 * leading dashes and whitespace often found in YouTube chapter titles.
 * This is the single entry point for all title cleaning after timecode removal.
 *
 * Examples:
 *   '"Song Name"'       → 'Song Name'
 *   "'Song Name'"       → 'Song Name'
 *   ' - Song Name'      → 'Song Name'
 *   '" - Song Name"'    → 'Song Name'
 *   "' - Song Name'"    → 'Song Name'
 */
export function normalizeTrackTitle(title: string): string {
  let normalized = title;

  // Iteratively strip surrounding quotes (single or double) and leading dash/whitespace
  // until stable — handles nested quotes and quotes wrapping dash-prefixed titles.
  let prev: string;
  do {
    prev = normalized;
    normalized = normalized
      .replace(/^"(.+)"$/, '$1')
      .replace(/^'(.+)'$/, '$1')
      .replace(/^"([^"]+)$/, '$1')  // unmatched leading "
      .replace(/^'([^']+)$/, '$1')  // unmatched leading '
      .replace(/^([^"]+)"$/, '$1')  // unmatched trailing "
      .replace(/^([^']+)'$/, '$1')  // unmatched trailing '
      .replace(/^[\s\u3000\u00A0\u200B\uFEFF]*[-–—‐‑]\s*/u, '')
      .replace(/^[\s\u3000\u00A0\u200B\uFEFF]+/u, '')
      .trim();
  } while (normalized !== prev);

  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = title
    .trim()
    .replace(/^[-–—‐‑]+\s*/u, '')
    .trim();
  return fallback || title;
}
