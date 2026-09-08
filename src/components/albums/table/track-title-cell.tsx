import type { Track } from '@/shared';
import { useMusicPlayer } from '@/contexts/music-player-context';

interface Props {
  track: Track;
}

export function TrackTitleCell({ track }: Props) {
  const { currentTrack } = useMusicPlayer();
  const isCurrentTrack = currentTrack?.id === track.id;
  return <div className={`font-medium truncate ${isCurrentTrack ? 'text-primary' : ''}`}>{track.title}</div>;
}
