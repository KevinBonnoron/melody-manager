import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Album } from '@melody-manager/shared';
import { MoreVertical } from 'lucide-react';
import { DeleteAlbumDialog } from './delete-album-dialog';
import { SyncAlbumChaptersDialog } from './sync-album-chapters-dialog';

interface Props {
  album: Album;
}

export function AlbumActionsMenu({ album }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SyncAlbumChaptersDialog album={album} />
        <DropdownMenuSeparator />
        <DeleteAlbumDialog album={album} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
