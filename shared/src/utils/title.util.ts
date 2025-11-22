/**
 * Normalizes track titles by stripping a leading " - " (or similar dash/space pattern)
 * often found in YouTube chapter titles (e.g. "1.  - Song Name" → "Song Name").
 */
export function normalizeTrackTitle(title: string): string {
  let normalized = title
    .replace(/^[\s\u3000\u00A0\u200B\uFEFF]*[-–—‐‑]\s*/u, '')
    .replace(/^[\s\u3000\u00A0\u200B\uFEFF]+/u, '')
    .trim();
  if (!normalized && title.trim()) {
    const trimmed = title.trim();
    if (trimmed.startsWith(' - ') || trimmed.startsWith(' – ') || trimmed.startsWith(' — ')) {
      normalized = trimmed.slice(3).trim();
    }
  }
  return normalized || title;
}
