import { tracksClient } from '@/clients/tracks.client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { cn } from '@/lib/utils';
import type { Track } from '@melody-manager/shared';
import { Heart, HeartOff, MoreVertical, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { ShareTrackDialog } from './share-track-dialog';

interface Props {
  track: Track;
}

export function TrackActionsCell({ track }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useTrackLikes();
  const { isDisliked, toggleDislike } = useTrackDislikes();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const liked = isLiked(track.id);
  const disliked = isDisliked(track.id);
  const canShare = !!track.metadata?.localPath || track.expand?.provider?.type === 'local';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await tracksClient.delete(track.id);
      toast.success(t('TrackActionsMenu.deleteSuccess', { title: track.title }));
    } catch {
      toast.error(t('TrackActionsMenu.deleteError'));
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

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

        {isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t('TrackActionsMenu.delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('TrackActionsMenu.delete')}</TooltipContent>
          </Tooltip>
        )}
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
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('TrackActionsMenu.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isAdmin && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('TrackActionsMenu.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('TrackActionsMenu.deleteConfirmDescription', { title: track.title })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t('TrackActionsMenu.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? t('TrackActionsMenu.deleting') : t('TrackActionsMenu.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
