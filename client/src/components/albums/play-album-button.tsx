import type { Track } from '@melody-manager/shared';
import { Play } from 'lucide-react';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { Button } from '../ui/button';

interface Props {
  tracks: Track[];
}

export function PlayAlbumButton({ tracks }: Props) {
  const { playTrack, setQueue } = useMusicPlayer();

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks);
      playTrack(tracks[0]);
    }
  };

  return (
    <Button size="lg" onClick={handlePlayAll} disabled={tracks.length === 0}>
      <Play className="h-5 w-5 mr-2" fill="currentColor" />
      Play Album
    </Button>
  );
}
