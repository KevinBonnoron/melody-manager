import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  isMuted: boolean;
  volume: number;
}

export function MuteButton({ onClick, isMuted, volume }: Props) {
  const isSilent = isMuted || volume === 0;
  return (
    <Button variant="ghost" size="icon" onClick={onClick} className="flex-shrink-0" aria-label={isSilent ? 'Unmute' : 'Mute'} aria-pressed={isSilent}>
      {isSilent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}
