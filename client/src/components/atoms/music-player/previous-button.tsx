import { SkipBack } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviousButtonProps {
  disabled: boolean;
  onPrevious: () => void;
}

export function PreviousButton({ disabled, onPrevious }: PreviousButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onPrevious} disabled={disabled}>
      <SkipBack className="h-4 w-4" />
    </Button>
  );
}
