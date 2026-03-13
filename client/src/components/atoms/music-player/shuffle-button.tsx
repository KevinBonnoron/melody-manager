import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShuffleButtonProps {
  shuffle: boolean;
  onToggle: () => void;
}

export function ShuffleButton({ shuffle, onToggle }: ShuffleButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} className={shuffle ? 'text-primary' : ''} aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'} aria-pressed={shuffle}>
      <Shuffle className="h-4 w-4" />
    </Button>
  );
}
