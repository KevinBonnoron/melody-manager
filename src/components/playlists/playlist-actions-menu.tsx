import { useNavigate } from '@tanstack/react-router';
import { ExternalLink, HeartOff, MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { playlistsClient } from '@/clients/playlists.client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMenuFocus } from '@/hooks/use-menu-focus';
import { usePlaylistRatings } from '@/hooks/use-ratings';
import { afterMenuCloses } from '@/lib/utils';
import type { Playlist } from '@/shared';

interface Props {
  playlist: Playlist;
  name: string;
  origin?: string;
}

// The playlist had no menu at all, so an imported one could be listened to and
// never removed: the route and the client method existed, nothing called them.
// A smart playlist is generated rather than kept, so it is not offered.
export function PlaylistActionsMenu({ playlist, name, origin }: Props) {
  const { t } = useTranslation();
  const menuFocus = useMenuFocus();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletable = playlist.type !== 'smart';
  const { isDisliked, toggleDislike } = usePlaylistRatings();
  const disliked = isDisliked(playlist.id);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await playlistsClient.delete(playlist.id);
      toast.success(t('PlaylistPage.deleteSuccess', { name }));
      // There is no playlists index; the library's own tab is where they live.
      navigate({ to: '/library', search: { tab: 'playlists' } });
    } catch {
      toast.error(t('PlaylistPage.deleteError'));
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t('PlaylistPage.actions')} {...menuFocus.triggerProps}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" {...menuFocus.contentProps}>
          {deletable && (
            <>
              <DropdownMenuItem onSelect={() => toggleDislike(playlist.id)}>
                <HeartOff className={disliked ? 'h-4 w-4 mr-2 text-destructive' : 'h-4 w-4 mr-2'} />
                {disliked ? t('PlaylistPage.undislike') : t('PlaylistPage.dislike')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {origin && (
            <DropdownMenuItem asChild>
              <a href={origin} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('PlaylistPage.openExternal')}
              </a>
            </DropdownMenuItem>
          )}
          {origin && deletable && <DropdownMenuSeparator />}
          {deletable && (
            <DropdownMenuItem onSelect={() => afterMenuCloses(() => setConfirmOpen(true))}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('PlaylistPage.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('PlaylistPage.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('PlaylistPage.deleteConfirmDescription', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('AlbumActionsMenu.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t('PlaylistPage.deleting') : t('PlaylistPage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
