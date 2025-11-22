import { cn } from '@/lib/utils';
import { Heart } from 'lucide-react';
import { Button } from '../ui/button';

interface Props {
  isLiked: boolean;
  toggleLike: () => void;
}

export function LikeButton({ isLiked, toggleLike }: Props) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    toggleLike();
  }

  return (
    <div className="flex items-center justify-center w-full">
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleClick}>
        <Heart className={cn('h-4 w-4', isLiked ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-primary')} />
      </Button>
    </div>
  );
}
