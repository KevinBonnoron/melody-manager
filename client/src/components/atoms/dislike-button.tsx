import { cn } from '@/lib/utils';
import { HeartOff } from 'lucide-react';
import { Button } from '../ui/button';

interface Props {
  isDisliked: boolean;
  toggleDislike: () => void;
}

export function DislikeButton({ isDisliked, toggleDislike }: Props) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    toggleDislike();
  }

  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleClick}>
      <HeartOff className={cn('h-4 w-4', isDisliked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive')} />
    </Button>
  );
}
