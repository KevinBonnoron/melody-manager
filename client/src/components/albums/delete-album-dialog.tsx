import type { Album } from '@melody-manager/shared';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Props {
  album: Album;
  trigger: (open: () => void) => ReactNode;
}

export function DeleteAlbumDialog({ album, trigger }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await albumsClient.delete(album.id);
      toast.success(t('AlbumActionsMenu.deleteSuccess', { name: album.name }));
      navigate({ to: '/library' });
    } catch {
      toast.error(t('AlbumActionsMenu.deleteError'));
    } finally {
      setIsDeleting(false);
      setOpen(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('AlbumActionsMenu.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('AlbumActionsMenu.deleteConfirmDescription', { name: album.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('AlbumActionsMenu.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t('AlbumActionsMenu.deleting') : t('AlbumActionsMenu.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
