import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { config } from '@/lib/config';
import type { Album } from '@melody-manager/shared';
import { Radio } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Props {
  album: Album;
}

export function SyncAlbumChaptersDialog({ album }: Props) {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);

  const tracks = album?.expand?.tracks_via_album ?? [];
  const isYoutubeAlbumWithChapters = tracks.length > 0 && tracks[0]?.expand?.provider?.type === 'youtube' && tracks.some((t) => t.metadata?.startTime !== undefined && t.metadata?.endTime !== undefined);

  if (!isYoutubeAlbumWithChapters) {
    return null;
  }

  const handleSync = async () => {
    if (!tracks[0]) {
      toast.error(t('AlbumActionsMenu.syncNoTracks'));
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch(`${config.server.url}/albums/${album.id}/sync-chapters`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync chapters');
      }

      const result = await response.json();
      toast.success(t('AlbumActionsMenu.syncSuccess', { count: result.matched }));
      window.location.reload();
    } catch (error) {
      console.error('Failed to sync chapters:', error);
      toast.error(error instanceof Error ? error.message : t('AlbumActionsMenu.syncError'));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
      <Radio className="h-4 w-4 mr-2" />
      {isSyncing ? t('AlbumActionsMenu.syncing') : t('AlbumActionsMenu.syncChapters')}
    </DropdownMenuItem>
  );
}
