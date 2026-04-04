import type { Album } from '@melody-manager/shared';
import { MoreVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useAlbumTracks } from '@/hooks/use-tracks';
import { DeleteAlbumDialog } from './delete-album-dialog';
import { DownloadAlbumMenuItem } from './download-album-menu-item';
import { ResyncAlbumMenuItem } from './resync-album-menu-item';

interface Props {
  album: Album;
}

export function AlbumActionsMenu({ album }: Props) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const isYouTubeAlbum = tracks.some((t) => t.sourceUrl.includes('youtube.com') || t.sourceUrl.includes('youtu.be'));
  const hasChapters = tracks.some((t) => t.metadata?.startTime !== undefined);
  const hasActionItems = isYouTubeAlbum || hasChapters;
  return (
    <DeleteAlbumDialog
      album={album}
      trigger={(openDialog) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DownloadAlbumMenuItem album={album} />
            <ResyncAlbumMenuItem album={album} />
            {isAdmin && (
              <>
                {hasActionItems && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={openDialog}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('AlbumActionsMenu.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />
  );
}
