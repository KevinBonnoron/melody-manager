import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShuffleButtonProps {
  shuffle: boolean;
  onToggle: () => void;
}

export function ShuffleButton({ shuffle, onToggle }: ShuffleButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} className={shuffle ? 'text-primary' : ''}>
      <Shuffle className="h-4 w-4" />
    </Button>
  );
}
