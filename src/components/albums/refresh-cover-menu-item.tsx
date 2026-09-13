import { ImageDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { Album } from '@/shared';

interface Props {
  album: Album;
}

export function RefreshCoverMenuItem({ album }: Props) {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      await albumsClient.refreshCover(album.id);
      toast.success(t('AlbumActionsMenu.coverRefreshed'));
    } catch {
      toast.error(t('AlbumActionsMenu.coverError'));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <DropdownMenuItem onSelect={(event) => event.preventDefault()} onClick={handleRefresh} disabled={isRefreshing}>
      <ImageDown className="h-4 w-4 mr-2" />
      {isRefreshing ? t('AlbumActionsMenu.refreshingCover') : t('AlbumActionsMenu.refreshCover')}
    </DropdownMenuItem>
  );
}
