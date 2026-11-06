import { FileSearch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { Album } from '@/shared';

interface Props {
  album: Album;
}

export function CheckAlbumMenuItem({ album }: Props) {
  const { t } = useTranslation();
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = async () => {
    if (isChecking) {
      return;
    }

    setIsChecking(true);
    try {
      const result = await albumsClient.check(album.id);
      toast.success(result.changed === 0 ? t('AlbumActionsMenu.checkClean', { count: result.checked }) : t('AlbumActionsMenu.checkChanged', { count: result.changed, lost: t('AlbumActionsMenu.checkLost', { count: result.lost }) }));
    } catch {
      toast.error(t('AlbumActionsMenu.checkError'));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <DropdownMenuItem onSelect={(event) => event.preventDefault()} onClick={handleCheck} disabled={isChecking}>
      <FileSearch className="h-4 w-4 mr-2" />
      {isChecking ? t('AlbumActionsMenu.checkChecking') : t('AlbumActionsMenu.checkFiles')}
    </DropdownMenuItem>
  );
}
