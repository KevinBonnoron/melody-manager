import type { Album } from '@melody-manager/shared';
import { useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumCollection } from '@/collections/album.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Props {
  album: Album;
}

export function DeleteAlbumDialog({ album }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      albumCollection.delete(album.id);
      toast.success(t('AlbumActionsMenu.deleteSuccess', { name: album.name }));
      navigate({ to: '/albums' });
    } catch {
      toast.error(t('AlbumActionsMenu.deleteError'));
    } finally {
      setIsDeleting(false);
      setOpen(false);
    }
  };

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {t('AlbumActionsMenu.delete')}
      </DropdownMenuItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('AlbumActionsMenu.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('AlbumActionsMenu.deleteConfirmDescription', { name: album.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
              {t('AlbumActionsMenu.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t('AlbumActionsMenu.deleting') : t('AlbumActionsMenu.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
