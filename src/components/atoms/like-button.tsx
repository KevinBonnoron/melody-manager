import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

interface Props {
  isLiked: boolean;
  toggleLike: () => void;
}

export function LikeButton({ isLiked, toggleLike }: Props) {
  const { t } = useTranslation();
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    toggleLike();
  }

  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleClick} aria-label={isLiked ? t('MusicPlayer.unlike') : t('MusicPlayer.like')} aria-pressed={isLiked}>
      <Heart className={cn('h-4 w-4', isLiked ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-primary')} />
    </Button>
  );
}
