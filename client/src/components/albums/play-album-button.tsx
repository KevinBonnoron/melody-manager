import type { Track } from '@melody-manager/shared';
import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { Button } from '../ui/button';

interface Props {
  tracks: Track[];
}

export function PlayAlbumButton({ tracks }: Props) {
  const { t } = useTranslation();
  const { playTrack, setQueue } = useMusicPlayer();

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks);
      playTrack(tracks[0]);
    }
  };

  return (
    <Button size="icon" className="sm:w-auto sm:px-4 h-9 w-9 sm:h-10" onClick={handlePlayAll} disabled={tracks.length === 0}>
      <Play className="h-5 w-5 sm:mr-2" fill="currentColor" />
      <span className="hidden sm:inline">{t('AlbumPage.playAlbum')}</span>
    </Button>
  );
}
