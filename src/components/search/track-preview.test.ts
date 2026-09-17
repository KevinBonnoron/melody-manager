import type { ResolvedTrack } from '@/shared';
import { announcedPreview, shownPreviews, supportsTrackPreview, toPreviewSegments } from './track-preview';
import { describe, expect, it } from 'bun:test';

const track = (over: Partial<ResolvedTrack>): ResolvedTrack => ({ title: 'Untitled', duration: 0, origin: 'https://youtu.be/x', artistName: 'Artist', albumName: 'Album', ...over });

describe('track preview', () => {
  it('offers the preview on the sources that cut a video into tracks', () => {
    expect(supportsTrackPreview('youtube')).toBe(true);
    expect(supportsTrackPreview('soundcloud')).toBe(false);
    expect(supportsTrackPreview('local')).toBe(false);
  });

  it('keeps the window each chapter was cut on, and its length', () => {
    const segments = toPreviewSegments([track({ title: 'Intro', duration: 90, metadata: { startTime: 0, endTime: 90 } }), track({ title: 'Second', duration: 120, metadata: { startTime: 90, endTime: 210 } })]);

    expect(segments.map((s) => [s.position, s.title, s.start, s.end, s.duration])).toEqual([
      [1, 'Intro', 0, 90, 90],
      [2, 'Second', 90, 210, 120],
    ]);
  });

  it('falls back to the track duration when the source was not cut', () => {
    const [segment] = toPreviewSegments([track({ title: 'A song', duration: 217 })]);

    expect(segment.start).toBeNull();
    expect(segment.end).toBeNull();
    expect(segment.duration).toBe(217);
  });

  it('never reports a negative length', () => {
    const [segment] = toPreviewSegments([track({ title: 'Mangled', duration: 10, metadata: { startTime: 200, endTime: 100 } })]);

    expect(segment.duration).toBe(0);
  });

  it('announces the preview the reader still has open', () => {
    const previews = new Map([['https://youtu.be/x', { status: 'ready' as const, tracks: [] }]]);

    expect(announcedPreview(previews, new Set(['https://youtu.be/x']), 'https://youtu.be/x')).toEqual({ status: 'ready', tracks: [] });
  });

  it('says nothing about a preview that was folded away before it arrived', () => {
    const previews = new Map([['https://youtu.be/x', { status: 'ready' as const, tracks: [] }]]);

    expect(announcedPreview(previews, new Set(), 'https://youtu.be/x')).toBeUndefined();
  });

  it('says nothing when no preview has changed', () => {
    expect(announcedPreview(new Map(), new Set(['https://youtu.be/x']), null)).toBeUndefined();
  });

  it('counts as open only what the current results still draw', () => {
    const open = new Set(['https://youtu.be/gone', 'https://youtu.be/here']);

    expect(shownPreviews(open, ['https://youtu.be/here', 'https://youtu.be/closed'])).toEqual(new Set(['https://youtu.be/here']));
  });

  it('says nothing about a preview whose row the query moved past', () => {
    const previews = new Map([['https://youtu.be/gone', { status: 'ready' as const, tracks: [] }]]);
    const drawn = shownPreviews(new Set(['https://youtu.be/gone']), ['https://youtu.be/other']);

    expect(announcedPreview(previews, drawn, 'https://youtu.be/gone')).toBeUndefined();
  });
});
