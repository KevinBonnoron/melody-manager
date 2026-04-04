import type { Track } from '@melody-manager/shared';
import { formatDuration } from '@/lib/utils';

interface Props {
  track: Track;
}

export function TrackDurationCell({ track }: Props) {
  return <div className="text-center">{formatDuration(track.duration)}</div>;
}
