import { useNowPlaying } from '@/hooks/use-now-playing';
import type { Track } from '@/shared';

interface Props {
  track: Track;
}

export function TrackTitleCell({ track }: Props) {
  const { track: nowPlaying } = useNowPlaying();
  const isCurrentTrack = nowPlaying?.id === track.id;
  return <div className={`font-medium truncate ${isCurrentTrack ? 'text-primary' : ''}`}>{track.title}</div>;
}
