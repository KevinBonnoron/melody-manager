import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { cn } from '@/lib/utils';
import type { Track } from '@melody-manager/shared';
import { Heart, HeartOff, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { ShareTrackDialog } from './share-track-dialog';

interface Props {
  track: Track;
}

export function TrackActionsCell({ track }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useTrackLikes();
  const { isDisliked, toggleDislike } = useTrackDislikes();

  const liked = isLiked(track.id);
  const disliked = isDisliked(track.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => toggleLike(track.id)}>
          <Heart className={cn('h-4 w-4 mr-2', liked && 'fill-primary text-primary')} />
          {liked ? t('TrackActionsMenu.unlike') : t('TrackActionsMenu.like')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleDislike(track.id)}>
          <HeartOff className={cn('h-4 w-4 mr-2', disliked && 'text-destructive')} />
          {disliked ? t('TrackActionsMenu.undislike') : t('TrackActionsMenu.dislike')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ShareTrackDialog track={track} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
