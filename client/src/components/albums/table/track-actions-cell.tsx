import type { Track } from '@melody-manager/shared';
import { Heart, HeartOff, MoreVertical, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { cn } from '@/lib/utils';
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
  const canShare = !!track.metadata?.localPath || track.expand?.provider?.type === 'local';

  return (
    <>
      {/* Desktop: inline icon buttons */}
      <div className="hidden sm:flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={liked ? t('TrackActionsMenu.unlike') : t('TrackActionsMenu.like')}
              aria-pressed={liked}
              onClick={(e) => {
                e.stopPropagation();
                toggleLike(track.id);
              }}
            >
              <Heart className={cn('h-4 w-4', liked ? 'fill-primary text-primary' : 'text-muted-foreground')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{liked ? t('TrackActionsMenu.unlike') : t('TrackActionsMenu.like')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={disliked ? t('TrackActionsMenu.undislike') : t('TrackActionsMenu.dislike')}
              aria-pressed={disliked}
              onClick={(e) => {
                e.stopPropagation();
                toggleDislike(track.id);
              }}
            >
              <HeartOff className={cn('h-4 w-4', disliked ? 'text-destructive' : 'text-muted-foreground')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{disliked ? t('TrackActionsMenu.undislike') : t('TrackActionsMenu.dislike')}</TooltipContent>
        </Tooltip>

        <ShareTrackDialog track={track}>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canShare} onClick={(e) => e.stopPropagation()} aria-label={t('TrackActionsMenu.share')}>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </ShareTrackDialog>
      </div>

      {/* Mobile: dropdown menu */}
      <div className="sm:hidden">
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
            <ShareTrackDialog track={track}>
              <DropdownMenuItem disabled={!canShare} onSelect={(e) => e.preventDefault()}>
                <Share2 className="h-4 w-4 mr-2" />
                {t('TrackActionsMenu.share')}
              </DropdownMenuItem>
            </ShareTrackDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
