import type { Track } from '@/shared';

// The order the files themselves give. Each rule decides only when it can tell
// the two apart, so a tie falls through rather than being left to the query,
// which is where an album's shifting order came from.
export function byPosition(a: Track, b: Track) {
  const first = a.metadata;
  const second = b.metadata;

  if (first?.trackNumber !== undefined && second?.trackNumber !== undefined) {
    // A double album numbers its second disc from one again.
    const byDisc = (first.discNumber ?? 1) - (second.discNumber ?? 1);
    if (byDisc !== 0) {
      return byDisc;
    }

    const byNumber = first.trackNumber - second.trackNumber;
    if (byNumber !== 0) {
      return byNumber;
    }
  } else if (first?.trackNumber !== undefined) {
    return -1;
  } else if (second?.trackNumber !== undefined) {
    return 1;
  }

  // Chapters of one long video, the only order those tracks have.
  if (first?.startTime !== undefined && second?.startTime !== undefined) {
    const byStart = first.startTime - second.startTime;
    if (byStart !== 0) {
      return byStart;
    }
  } else if (first?.startTime !== undefined) {
    return -1;
  } else if (second?.startTime !== undefined) {
    return 1;
  }

  return a.title.localeCompare(b.title);
}
