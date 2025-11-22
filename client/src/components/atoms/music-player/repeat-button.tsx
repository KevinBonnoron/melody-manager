import { Repeat, Repeat1 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RepeatButtonProps {
  repeatMode: 'none' | 'all' | 'one';
  onToggle: () => void;
}

export function RepeatButton({ repeatMode, onToggle }: RepeatButtonProps) {
  const getTooltipText = () => {
    switch (repeatMode) {
      case 'none':
        return 'Enable repeat';
      case 'all':
        return 'Repeat playlist';
      case 'one':
        return 'Repeat track';
      default:
        return 'Repeat';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onToggle} className={repeatMode !== 'none' ? 'text-primary' : ''}>
          {repeatMode === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}
