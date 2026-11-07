import { ExternalLink, HeartOff, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useMenuFocus } from '@/hooks/use-menu-focus';
import { useAlbumRatings } from '@/hooks/use-ratings';
import { useAlbumTracks } from '@/hooks/use-tracks';
import { afterMenuCloses } from '@/lib/utils';
import type { Album } from '@/shared';
import { CheckAlbumMenuItem } from './check-album-menu-item';
import { DeleteAlbumDialog } from './delete-album-dialog';
import { DownloadAlbumMenuItem } from './download-album-menu-item';
import { EditAlbumDialog } from './edit-album-dialog';
import { RefreshCoverMenuItem } from './refresh-cover-menu-item';
import { ResyncAlbumMenuItem } from './resync-album-menu-item';

interface Props {
  album: Album;
  currentArtistId?: string;
  origin?: string;
}

export function AlbumActionsMenu({ album, currentArtistId, origin }: Props) {
  const { t } = useTranslation();
  const menuFocus = useMenuFocus();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const { isDisliked, toggleDislike } = useAlbumRatings();
  const disliked = isDisliked(album.id);
  const [editOpen, setEditOpen] = useState(false);
  const isYouTubeAlbum = tracks.some((t) => t.origin.includes('youtube.com') || t.origin.includes('youtu.be'));
  const hasChapters = tracks.some((t) => t.metadata?.startTime !== undefined);
  const hasActionItems = isYouTubeAlbum || hasChapters;
  return (
    <>
      <DeleteAlbumDialog
        album={album}
        trigger={(openDialog) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t('AlbumPage.actions')} {...menuFocus.triggerProps}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" {...menuFocus.contentProps}>
              {origin && (
                <>
                  <DropdownMenuItem asChild>
                    <a href={origin} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('AlbumPage.openExternal')}
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => toggleDislike(album.id)}>
                <HeartOff className={disliked ? 'h-4 w-4 mr-2 text-destructive' : 'h-4 w-4 mr-2'} />
                {disliked ? t('AlbumActionsMenu.undislike') : t('AlbumActionsMenu.dislike')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DownloadAlbumMenuItem album={album} />
              <ResyncAlbumMenuItem album={album} />
              {isAdmin && (
                <>
                  {hasActionItems && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => afterMenuCloses(() => setEditOpen(true))}>
                    <Pencil className="h-4 w-4 mr-2" />
                    {t('AlbumActionsMenu.edit')}
                  </DropdownMenuItem>
                  <CheckAlbumMenuItem album={album} />
                  <RefreshCoverMenuItem album={album} />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => afterMenuCloses(openDialog)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('AlbumActionsMenu.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
      <EditAlbumDialog album={album} currentArtistId={currentArtistId} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
