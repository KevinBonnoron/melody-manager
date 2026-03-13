import type { Album } from '@melody-manager/shared';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAlbumTracks } from '@/hooks/use-tracks';

interface Props {
  album: Album;
}

export function ResyncAlbumMenuItem({ album }: Props) {
  const { t } = useTranslation();
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const [isSyncing, setIsSyncing] = useState(false);
  const hasChapters = tracks.some((track) => track.metadata?.startTime !== undefined);

  const handleResync = async () => {
    if (isSyncing) { return; }
    setIsSyncing(true);
    try {
      await albumsClient.resync(album.id);
      toast.success(t('AlbumActionsMenu.resyncStarted', 'Resync started'));
    } catch {
      toast.error(t('AlbumActionsMenu.resyncError', 'Failed to start resync'));
    } finally {
      setIsSyncing(false);
    }
  };

  if (!hasChapters) {
    return null;
  }

  return (
    <DropdownMenuItem onSelect={handleResync} disabled={isSyncing}>
      <RefreshCw className="h-4 w-4 mr-2" />
      {t('AlbumActionsMenu.resync', 'Resync chapters')}
    </DropdownMenuItem>
  );
}
