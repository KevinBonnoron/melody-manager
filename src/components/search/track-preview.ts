import type { TrackPreviewState } from '@/hooks/use-track-previews';
import type { ResolvedTrack } from '@/shared';

const PREVIEWABLE_SOURCES = ['youtube'];

export function supportsTrackPreview(source: string): boolean {
  return PREVIEWABLE_SOURCES.includes(source);
}

export interface PreviewSegment {
  key: string;
  position: number;
  title: string;
  start: number | null;
  end: number | null;
  duration: number;
}

export function toPreviewSegments(tracks: ResolvedTrack[]): PreviewSegment[] {
  return tracks.map((track, index) => {
    const start = track.metadata?.startTime ?? null;
    const end = track.metadata?.endTime ?? null;
    return {
      key: `${index}-${track.title}`,
      position: index + 1,
      title: track.title,
      start,
      end,
      duration: start !== null && end !== null ? Math.max(0, end - start) : track.duration,
    };
  });
}

// A preview that has been folded away keeps loading, and its result must not reach the live
// region: what is announced is only ever a preview the reader still has open.
export function announcedPreview(previews: ReadonlyMap<string, TrackPreviewState>, expanded: ReadonlySet<string>, lastChanged: string | null): TrackPreviewState | undefined {
  if (lastChanged === null || !expanded.has(lastChanged)) {
    return undefined;
  }

  return previews.get(lastChanged);
}

// An open preview whose row is no longer on screen, because the query moved on, is not one the
// reader can be told about: what counts as open is what this render actually draws.
export function shownPreviews(expanded: ReadonlySet<string>, candidates: Iterable<string>): Set<string> {
  const shown = new Set<string>();
  for (const url of candidates) {
    if (expanded.has(url)) {
      shown.add(url);
    }
  }

  return shown;
}
