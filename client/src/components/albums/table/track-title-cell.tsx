import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@melody-manager/shared';

interface Props {
  track: Track;
}

export function TrackTitleCell({ track }: Props) {
  const { currentTrack } = useMusicPlayer();
  const isCurrentTrack = currentTrack?.id === track.id;

  return <div className={`font-medium ${isCurrentTrack ? 'text-primary' : ''}`}>{track.title}</div>;
}
