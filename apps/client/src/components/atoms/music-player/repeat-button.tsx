import { Repeat, Repeat1 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ControlDot } from './control-dot';

interface RepeatButtonProps {
  repeatMode: 'none' | 'all' | 'one';
  onToggle: () => void;
}

export function RepeatButton({ repeatMode, onToggle }: RepeatButtonProps) {
  const { t } = useTranslation();
  const repeating = repeatMode !== 'none';
  const label = repeatMode === 'all' ? t('MusicPlayer.repeatAll') : repeatMode === 'one' ? t('MusicPlayer.repeatOne') : t('MusicPlayer.repeatOff');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" onClick={onToggle} className="relative" aria-label={label} aria-pressed={repeating}>
          {repeatMode === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          <ControlDot shown={repeating} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
