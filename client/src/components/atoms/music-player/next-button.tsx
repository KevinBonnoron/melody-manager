import { SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NextButtonProps {
  disabled: boolean;
  onNext: () => void;
}

export function NextButton({ disabled, onNext }: NextButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onNext} disabled={disabled}>
      <SkipForward className="h-5 w-5" />
    </Button>
  );
}
