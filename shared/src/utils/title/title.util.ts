const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\u3000', '\u00A0', '\u200B', '\uFEFF']);
const DASHES = new Set(['-', '–', '—', '‐', '‑']);
const QUOTES = new Set(['"', "'"]);

/**
 * Normalizes track titles by stripping surrounding quotes (single or double),
 * leading dashes and whitespace often found in YouTube chapter titles.
 * This is the single entry point for all title cleaning after timecode removal.
 *
 * Single-pass approach: find the meaningful content boundaries by skipping
 * leading whitespace/dashes/quotes and trailing quotes from outside in.
 */
export function normalizeTrackTitle(title: string): string {
  let start = 0;
  let end = title.length;

  // Peel layers from outside in — each pass strips one layer of
  // leading whitespace/dash and/or surrounding or unmatched quotes.
  let changed = true;
  while (changed && start < end) {
    changed = false;

    // Skip leading whitespace
    while (start < end && WHITESPACE.has(title[start]!)) {
      start++;
      changed = true;
    }

    // Skip leading dash (with optional trailing whitespace)
    if (start < end && DASHES.has(title[start]!)) {
      start++;
      while (start < end && WHITESPACE.has(title[start]!)) {
        start++;
      }
      changed = true;
    }

    // Strip surrounding matched quotes
    if (start < end - 1 && QUOTES.has(title[start]!) && title[start] === title[end - 1]!) {
      start++;
      end--;
      changed = true;
      continue;
    }

    // Strip unmatched leading quote (only if that quote char appears nowhere else)
    if (start < end && QUOTES.has(title[start]!)) {
      const q = title[start]!;
      if (!title.slice(start + 1, end).includes(q)) {
        start++;
        changed = true;
      }
    }

    // Strip unmatched trailing quote (only if that quote char appears nowhere else)
    if (start < end && QUOTES.has(title[end - 1]!)) {
      const q = title[end - 1]!;
      if (!title.slice(start, end - 1).includes(q)) {
        end--;
        changed = true;
      }
    }
  }

  const normalized = title.slice(start, end);
  if (normalized.length > 0) {
    return normalized;
  }

  // Fallback for edge cases (e.g. title is only dashes)
  const fallback = title.trim();
  return fallback || title;
}
