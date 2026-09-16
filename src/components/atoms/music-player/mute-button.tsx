import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  isMuted: boolean;
  volume: number;
}

export function MuteButton({ onClick, isMuted, volume }: Props) {
  const { t } = useTranslation();
  const isSilent = isMuted || volume === 0;
  return (
    <Button variant="ghost" size="icon" onClick={onClick} className="flex-shrink-0" aria-label={isSilent ? t('MusicPlayer.unmute') : t('MusicPlayer.mute')} aria-pressed={isSilent}>
      {isSilent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}
