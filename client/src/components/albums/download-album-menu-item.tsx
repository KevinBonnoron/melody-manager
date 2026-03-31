import type { Album } from '@melody-manager/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
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
  const [isDownloading, setIsDownloading] = useState(false);
  const allDownloaded = tracks.length > 0 && tracks.every((track) => track.metadata?.localPath);
  const isYouTubeAlbum = tracks.some((t) => t.sourceUrl.includes('youtube.com') || t.sourceUrl.includes('youtu.be'));

  if (!isYouTubeAlbum) {
    return null;
  }

  const handleDownload = async () => {
    if (allDownloaded || isDownloading) {
      return;
    }

    setIsDownloading(true);
    try {
      await albumsClient.download(album.id);
      toast.success(t('AlbumActionsMenu.downloadStarted', 'Download started'));
    } catch {
      toast.error(t('AlbumActionsMenu.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <DropdownMenuItem onSelect={handleDownload} disabled={allDownloaded || isDownloading}>
      <Download className="h-4 w-4 mr-2" />
      {allDownloaded ? t('AlbumActionsMenu.downloaded') : t('AlbumActionsMenu.download')}
    </DropdownMenuItem>
  );
}
