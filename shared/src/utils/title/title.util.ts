/**
 * Normalizes track titles by stripping surrounding double quotes and
 * leading " - " (or similar dash/space pattern) often found in YouTube
 * chapter titles (e.g. '"Song Name"' → 'Song Name', " - Song Name" → "Song Name").
 */
export function normalizeTrackTitle(title: string): string {
  const normalized = title
    .replace(/^"(.+)"$/, '$1')
    .replace(/^[\s\u3000\u00A0\u200B\uFEFF]*[-–—‐‑]\s*/u, '')
    .replace(/^[\s\u3000\u00A0\u200B\uFEFF]+/u, '')
    .trim();
  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = title
    .trim()
    .replace(/^[-–—‐‑]+\s*/u, '')
    .trim();
  return fallback || title;
}
