import { Check, Heart, HeartOff, ListPlus, MoreVertical, Plus, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { playlistsClient } from '@/clients/playlists.client';
import { trackCollection } from '@/collections/track.collection';
import { CreatePlaylistDialog } from '@/components/playlists/create-playlist-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useMenuFocus } from '@/hooks/use-menu-focus';
import { useManualPlaylists } from '@/hooks/use-playlists';
import { useTrackRatings } from '@/hooks/use-ratings';
import { afterMenuCloses, cn } from '@/lib/utils';
import type { Track } from '@/shared';
import { Button } from '../../ui/button';
import { ShareTrackDialog } from './share-track-dialog';

interface Props {
  track: Track;
}

export function TrackActionsCell({ track }: Props) {
  const { t } = useTranslation();
  const menuFocus = useMenuFocus();
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTrackRatings();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const liked = isLiked(track.id);
  const { data: playlists = [] } = useManualPlaylists();
  const addToPlaylist = async (id: string, name: string) => {
    try {
      await playlistsClient.addTracks(id, [track.id]);
      toast.success(t('CreatePlaylist.added', { name }));
    } catch {
      toast.error(t('CreatePlaylist.addError'));
    }
  };
  const disliked = isDisliked(track.id);
  // A share link streams the track through the same service as playback, which
  // resolves the provider on demand when there is no file. Only a track that
  // can be played from nowhere has nothing to share.
  const canShare = track.availability !== 'none';
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await trackCollection.delete(track.id).isPersisted.promise;
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
      {/* One opinion stays in reach, the rest folds into the menu: like and
          dislike side by side made every row argue with itself, and the same
          menu already existed for the phone. */}
      <div className="flex items-center gap-0.5">
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('TrackActionsMenu.actions')} onClick={(e) => e.stopPropagation()} {...menuFocus.triggerProps}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} {...menuFocus.contentProps}>
            <DropdownMenuItem onSelect={() => toggleDislike(track.id)}>
              <HeartOff className={cn('h-4 w-4 mr-2', disliked && 'text-destructive')} />
              {disliked ? t('TrackActionsMenu.undislike') : t('TrackActionsMenu.dislike')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListPlus className="h-4 w-4 mr-2" />
                {t('CreatePlaylist.addTo')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {/* A playlist already holding the track takes it again without
                    complaining and without changing: the list is a set. Saying
                    so here beats letting the click succeed and do nothing. */}
                {playlists.map((playlist) => {
                  const alreadyIn = playlist.tracks?.includes(track.id) ?? false;
                  return (
                    <DropdownMenuItem key={playlist.id} disabled={alreadyIn} onSelect={() => addToPlaylist(playlist.id, playlist.name)}>
                      {alreadyIn && <Check className="h-4 w-4 mr-2" />}
                      {playlist.name}
                    </DropdownMenuItem>
                  );
                })}
                {playlists.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={() => afterMenuCloses(() => setCreatePlaylistOpen(true))}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('CreatePlaylist.newOne')}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
                <DropdownMenuItem onSelect={() => afterMenuCloses(() => setDeleteDialogOpen(true))}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('TrackActionsMenu.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreatePlaylistDialog open={createPlaylistOpen} onOpenChange={setCreatePlaylistOpen} trackIds={[track.id]} />

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
