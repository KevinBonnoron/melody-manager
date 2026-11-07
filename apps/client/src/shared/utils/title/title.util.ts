const CLEANUP = /^[\s\u3000\u00A0\u200B\uFEFF]*[-–—‐‑]\s*|^[\s\u3000\u00A0\u200B\uFEFF]+|^(["'])(.+)\1$|^(["'])([^"']+)$|^([^"']+)(["'])$/u;

/** Normalizes track titles by stripping surrounding/unmatched quotes (single or double), leading dashes and whitespace often found in YouTube chapter titles. */
export function normalizeTrackTitle(title: string): string {
  let normalized = title;
  let prev: string;
  do {
    prev = normalized;
    normalized = normalized.replace(CLEANUP, '$2$4$5').trim();
  } while (normalized !== prev);

  return normalized || title.trim();
}
