import { Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ControlDot } from './control-dot';

interface ShuffleButtonProps {
  shuffle: boolean;
  onToggle: () => void;
}

export function ShuffleButton({ shuffle, onToggle }: ShuffleButtonProps) {
  const { t } = useTranslation();
  const label = shuffle ? t('MusicPlayer.shuffleOff') : t('MusicPlayer.shuffleOn');

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={onToggle} title={label} aria-label={label} aria-pressed={shuffle}>
      <Shuffle className="h-4 w-4" />
      <ControlDot shown={shuffle} />
    </Button>
  );
}
