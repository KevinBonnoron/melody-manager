import type { Track } from '@melody-manager/shared';

interface Props {
  track: Track;
}

export function TrackArtistsCell({ track }: Props) {
  const names = track.expand?.artists?.map((artist) => artist.name).join(', ') ?? '';
  return <div className="text-muted-foreground hidden md:table-cell">{names || '—'}</div>;
}
