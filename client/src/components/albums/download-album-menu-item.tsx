import type { Album } from '@melody-manager/shared';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAlbumTracks } from '@/hooks/use-tracks';

interface Props {
  album: Album;
}

export function DownloadAlbumMenuItem({ album }: Props) {
  const { t } = useTranslation();
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const allDownloaded = tracks.length > 0 && tracks.every((track) => track.metadata?.localPath);

  const handleDownload = async () => {
    if (allDownloaded) {
      return;
    }

    try {
      await albumsClient.download(album.id);
      toast.success(t('AlbumActionsMenu.downloadStarted', 'Download started'));
    } catch {
      toast.error(t('AlbumActionsMenu.downloadError'));
    }
  };

  return (
    <DropdownMenuItem onSelect={handleDownload} disabled={allDownloaded}>
      <Download className="h-4 w-4 mr-2" />
      {allDownloaded ? t('AlbumActionsMenu.downloaded') : t('AlbumActionsMenu.download')}
    </DropdownMenuItem>
  );
}
